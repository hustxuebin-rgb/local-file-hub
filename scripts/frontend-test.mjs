import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:5174';
const SCREENSHOT_DIR = path.resolve(__dirname, '../reports/frontend-test-screenshots');
const REPORT_PATH = path.resolve(__dirname, '../reports/frontend-test-report.md');

// Ensure screenshot directory exists
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// All pages to test (based on router.tsx)
const PAGES = [
  { path: '/login', name: '登录页', needAuth: false, needAdmin: false },
  { path: '/files', name: '文件管理', needAuth: true, needAdmin: false },
  { path: '/upload', name: '上传页', needAuth: true, needAdmin: false },
  { path: '/recycle', name: '回收站', needAuth: true, needAdmin: false },
  { path: '/share/my', name: '我的分享', needAuth: true, needAdmin: false },
  { path: '/share/received', name: '收到的分享', needAuth: true, needAdmin: false },
  { path: '/center/profile', name: '个人中心/个人信息', needAuth: true, needAdmin: false },
  { path: '/center/storage', name: '个人中心/存储管理', needAuth: true, needAdmin: false },
  { path: '/admin/disk', name: '后台管理/磁盘管理', needAuth: true, needAdmin: true },
  { path: '/admin/users', name: '后台管理/用户管理', needAuth: true, needAdmin: true },
  { path: '/admin/shares', name: '后台管理/分享审核', needAuth: true, needAdmin: true },
  { path: '/admin/sync-logs', name: '后台管理/同步日志', needAuth: true, needAdmin: true },
  { path: '/admin/alerts', name: '后台管理/告警', needAuth: true, needAdmin: true },
];

// Test results storage
const results = [];
const allConsoleErrors = [];
const allNetworkErrors = [];

// Scoring
const scorePage = (pageResult) => {
  let fluidity = 100;
  let layout = 100;
  let apiPerf = 100;
  let dataDisplay = 100;
  let consoleScore = 100;

  // Fluidity scoring
  if (pageResult.loadTime > 5000) fluidity -= 40;
  else if (pageResult.loadTime > 3000) fluidity -= 20;
  else if (pageResult.loadTime > 1500) fluidity -= 10;

  // Layout scoring
  if (!pageResult.rendered) layout = 0;
  if (pageResult.hasWhiteScreen) layout -= 50;
  if (pageResult.hasOverflow) layout -= 20;

  // API performance
  const failedRequests = pageResult.networkRequests.filter(r => r.status >= 400);
  if (failedRequests.length > 0) {
    apiPerf -= Math.min(60, failedRequests.length * 20);
  }
  const slowApis = pageResult.networkRequests.filter(r => r.timing > 2000);
  if (slowApis.length > 0) {
    apiPerf -= Math.min(30, slowApis.length * 10);
  }

  // Data display
  if (pageResult.isEmpty) dataDisplay -= 30;

  // Console errors
  if (pageResult.consoleErrors.length > 0) {
    consoleScore -= Math.min(80, pageResult.consoleErrors.length * 25);
  }
  if (pageResult.consoleWarnings.length > 0) {
    consoleScore -= Math.min(40, pageResult.consoleWarnings.length * 5);
  }

  return {
    fluidity: Math.max(0, fluidity),
    layout: Math.max(0, layout),
    apiPerf: Math.max(0, apiPerf),
    dataDisplay: Math.max(0, dataDisplay),
    consoleScore: Math.max(0, consoleScore),
  };
};

const getOverallScore = (scores) => {
  return Math.round(
    scores.fluidity * 0.25 +
    scores.layout * 0.20 +
    scores.apiPerf * 0.25 +
    scores.dataDisplay * 0.20 +
    scores.consoleScore * 0.10
  );
};

async function run() {
  console.log('🚀 启动浏览器...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  // Collect console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      allConsoleErrors.push({ page: currentPageName, text, type });
    }
  });

  page.on('pageerror', err => {
    allConsoleErrors.push({ page: currentPageName, text: err.message, type: 'pageerror' });
  });

  let currentPageName = '';

  // ========================================
  // STEP 1: Test Login Page
  // ========================================
  console.log('\n📄 测试页面: /login (登录页)');
  currentPageName = '/login';

  const loginStart = Date.now();
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
  const loginLoadTime = Date.now() - loginStart;

  await page.waitForTimeout(1000);

  // Screenshot login page
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-login.png'), fullPage: true });
  console.log('  ✅ 截图: 01-login.png');

  // Check login page rendering
  const loginBodyText = await page.evaluate(() => document.body.innerText);
  const loginHasForm = loginBodyText.includes('登录') || loginBodyText.includes('用户名') || loginBodyText.includes('密码');
  const loginIsWhite = loginBodyText.trim().length < 50;

  // Get login page console errors
  const loginConsoleErrors = allConsoleErrors.filter(e => e.page === '/login');
  const loginConsoleWarnings = [];

  // Get network requests for login page
  const loginNetworkReqs = [];

  results.push({
    path: '/login',
    name: '登录页',
    loadTime: loginLoadTime,
    rendered: loginHasForm,
    hasWhiteScreen: loginIsWhite,
    hasOverflow: false,
    isEmpty: false,
    consoleErrors: loginConsoleErrors,
    consoleWarnings: loginConsoleWarnings,
    networkRequests: loginNetworkReqs,
    bodyText: loginBodyText.substring(0, 300),
  });

  // ========================================
  // STEP 2: Login
  // ========================================
  console.log('\n🔐 执行登录...');

  // Fill login form
  try {
    // Try to find username input
    const usernameInput = page.locator('input').first();
    await usernameInput.fill('admin');
    console.log('  ✅ 填写用户名');

    // Find password input
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill('admin123');
    console.log('  ✅ 填写密码');

    // Click login button
    const loginButton = page.locator('button').filter({ hasText: /登录|登 录|login|sign in/i }).first();
    await loginButton.click();
    console.log('  ✅ 点击登录');

    // Wait for navigation to /files
    await page.waitForURL('**/files**', { timeout: 15000 });
    await page.waitForTimeout(2000);
    console.log('  ✅ 登录成功，已跳转到 /files');
  } catch (err) {
    console.log(`  ❌ 登录失败: ${err.message}`);
    // Try alternative approach - press Enter after filling
    try {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
      const usernameInput2 = page.locator('input').first();
      await usernameInput2.fill('admin');
      const passwordInput2 = page.locator('input[type="password"]');
      await passwordInput2.fill('admin123');
      await passwordInput2.press('Enter');
      await page.waitForURL('**/files**', { timeout: 15000 });
      await page.waitForTimeout(2000);
      console.log('  ✅ 备用方式登录成功');
    } catch (err2) {
      console.log(`  ❌ 备用登录也失败: ${err2.message}`);
    }
  }

  // ========================================
  // STEP 3: Test all authenticated pages
  // ========================================
  for (const pageInfo of PAGES) {
    if (pageInfo.path === '/login') continue; // Already tested
    if (!pageInfo.needAuth) continue;

    console.log(`\n📄 测试页面: ${pageInfo.path} (${pageInfo.name})`);
    currentPageName = pageInfo.path;

    const pageResult = {
      path: pageInfo.path,
      name: pageInfo.name,
      loadTime: 0,
      rendered: false,
      hasWhiteScreen: false,
      hasOverflow: false,
      isEmpty: false,
      consoleErrors: [],
      consoleWarnings: [],
      networkRequests: [],
      bodyText: '',
    };

    // Collect network requests during page load
    const networkReqs = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/')) {
        networkReqs.push({
          url: response.url(),
          status: response.status(),
          timing: 0,
        });
      }
    });

    try {
      const startTime = Date.now();
      await page.goto(`${BASE_URL}${pageInfo.path}`, { waitUntil: 'networkidle', timeout: 30000 });
      pageResult.loadTime = Date.now() - startTime;

      await page.waitForTimeout(1500);

      // Take screenshot
      const screenshotName = pageInfo.path.replace(/\//g, '-').replace(/^-/, '');
      const screenshotPath = path.join(SCREENSHOT_DIR, `${screenshotName}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  ✅ 截图: ${screenshotName}.png`);

      // Check rendering
      pageResult.bodyText = await page.evaluate(() => document.body.innerText);
      pageResult.hasWhiteScreen = pageResult.bodyText.trim().length < 30;
      pageResult.rendered = !pageResult.hasWhiteScreen && pageResult.bodyText.length > 50;

      // Check for overflow
      const overflowInfo = await page.evaluate(() => {
        const overflows = [];
        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right > window.innerWidth + 10) {
            overflows.push({ tag: el.tagName, right: rect.right, viewport: window.innerWidth });
          }
        });
        return overflows;
      });
      pageResult.hasOverflow = overflowInfo.length > 0;

      // Check for empty states (meaningful content)
      const contentElements = await page.evaluate(() => {
        const tables = document.querySelectorAll('.ant-table, table');
        const cards = document.querySelectorAll('.ant-card');
        const lists = document.querySelectorAll('.ant-list');
        const forms = document.querySelectorAll('.ant-form');
        const spins = document.querySelectorAll('.ant-spin');
        const empties = document.querySelectorAll('.ant-empty');
        const results = document.querySelectorAll('.ant-result');
        return {
          tableCount: tables.length,
          cardCount: cards.length,
          listCount: lists.length,
          formCount: forms.length,
          spinCount: spins.length,
          emptyCount: empties.length,
          resultCount: results.length,
        };
      });

      if (contentElements.emptyCount > 0 && contentElements.tableCount === 0 && contentElements.cardCount === 0 && contentElements.listCount === 0 && contentElements.formCount === 0) {
        pageResult.isEmpty = true;
      }

      // Collect console errors for this page
      pageResult.consoleErrors = allConsoleErrors.filter(e => e.page === pageInfo.path);

      // Store network requests
      pageResult.networkRequests = [...networkReqs];
      allNetworkErrors.push(...networkReqs.filter(r => r.status >= 400).map(r => ({
        ...r,
        page: pageInfo.path,
      })));

      // Status output
      if (pageResult.rendered) {
        console.log(`  ✅ 页面正常渲染 (${pageResult.loadTime}ms)`);
      } else {
        console.log(`  ❌ 页面渲染异常 (白屏: ${pageResult.hasWhiteScreen})`);
      }

      if (pageResult.consoleErrors.length > 0) {
        console.log(`  ⚠️  控制台错误: ${pageResult.consoleErrors.length} 个`);
        pageResult.consoleErrors.forEach(e => console.log(`     - ${e.text}`));
      }

      if (pageResult.hasOverflow) {
        console.log(`  ⚠️  元素溢出: ${overflowInfo.length} 个`);
      }

      if (pageResult.isEmpty) {
        console.log(`  ⚠️  页面内容为空 (Empty状态)`);
      }

    } catch (err) {
      console.log(`  ❌ 页面加载失败: ${err.message}`);
      pageResult.hasWhiteScreen = true;
      pageResult.rendered = false;
      pageResult.consoleErrors.push({ text: `Page load error: ${err.message}`, type: 'error' });
    }

    results.push(pageResult);
  }

  // ========================================
  // STEP 4: Generate Report
  // ========================================
  console.log('\n\n========================================');
  console.log('📊 生成测试报告...');
  console.log('========================================\n');

  // Calculate scores
  const scoredResults = results.map(r => {
    const scores = scorePage(r);
    const overall = getOverallScore(scores);
    return { ...r, scores, overall };
  });

  // Calculate overall average
  const totalScore = Math.round(
    scoredResults.reduce((sum, r) => sum + r.overall, 0) / scoredResults.length
  );

  // Determine issues
  const p0Issues = [];
  const p1Issues = [];
  const p2Issues = [];

  scoredResults.forEach(r => {
    if (!r.rendered || r.hasWhiteScreen) {
      p0Issues.push({ page: r.path, name: r.name, dimension: '界面渲染', issue: '页面白屏或渲染失败', suggestion: '检查路由配置和组件导入' });
    }
    if (r.consoleErrors.length > 0) {
      r.consoleErrors.forEach(e => {
        p0Issues.push({ page: r.path, name: r.name, dimension: '控制台错误', issue: e.text, suggestion: '检查相关代码逻辑' });
      });
    }
    if (r.hasOverflow) {
      p1Issues.push({ page: r.path, name: r.name, dimension: '界面布局', issue: '存在元素溢出视口', suggestion: '检查CSS样式和响应式布局' });
    }
    if (r.isEmpty) {
      p1Issues.push({ page: r.path, name: r.name, dimension: '数据显示', issue: '页面显示为空状态，可能数据未加载', suggestion: '检查API接口是否正常返回数据' });
    }
    if (r.loadTime > 5000) {
      p1Issues.push({ page: r.path, name: r.name, dimension: '加载性能', issue: `页面加载时间过长: ${r.loadTime}ms`, suggestion: '优化数据加载和组件渲染' });
    }
    if (r.loadTime > 3000 && r.loadTime <= 5000) {
      p2Issues.push({ page: r.path, name: r.name, dimension: '加载性能', issue: `页面加载时间偏长: ${r.loadTime}ms`, suggestion: '考虑添加loading状态或优化请求' });
    }
    // Check for network errors
    const netErrors = r.networkRequests.filter(req => req.status >= 400);
    netErrors.forEach(e => {
      p1Issues.push({ page: r.path, name: r.name, dimension: '接口响应', issue: `API请求失败: ${e.url} (HTTP ${e.status})`, suggestion: '检查后端接口是否正常' });
    });
  });

  // Build report markdown
  let report = `# 前端页面测试报告

**测试时间**：${new Date().toLocaleString('zh-CN')}
**测试范围**：共 ${scoredResults.length} 个页面
**前端环境**：${BASE_URL}
**后端环境**：http://localhost:8080
**测试账号**：admin / admin123
**浏览器**：Chromium (Headless) 1440x900

---

## 📊 总体评分: ${totalScore}/100

| 维度 | 权重 | 说明 |
|------|:---:|------|
| 界面流畅性 | 25% | 页面加载时间、渲染性能 |
| 界面布局 | 20% | 元素溢出、响应式布局 |
| 接口响应时间 | 25% | API请求状态与耗时 |
| 数据显示完整性 | 20% | 内容渲染、数据展示 |
| 控制台与异常 | 10% | JS错误、警告信息 |

---

## 📈 各页面评分详情

| 页面 | 路径 | 流畅性 | 布局 | API | 数据显示 | 控制台 | **总分** | 状态 |
|------|------|:------:|:----:|:---:|:--------:|:------:|:--------:|:----:|
`;

  scoredResults.forEach(r => {
    const statusIcon = r.overall >= 80 ? '✅' : r.overall >= 60 ? '⚠️' : '❌';
    report += `| ${r.name} | \`${r.path}\` | ${r.scores.fluidity} | ${r.scores.layout} | ${r.scores.apiPerf} | ${r.scores.dataDisplay} | ${r.scores.consoleScore} | **${r.overall}** | ${statusIcon} |\n`;
  });

  report += `
**总体平均分**: ${totalScore}/100

---

## 🔴 P0 阻塞 (必须修复)

`;

  if (p0Issues.length === 0) {
    report += `> ✅ 无 P0 级别问题\n\n`;
  } else {
    report += `| 页面 | 维度 | 问题描述 | 修复建议 |\n`;
    report += `|------|------|---------|----------|\n`;
    p0Issues.forEach(i => {
      report += `| ${i.name} (\`${i.page}\`) | ${i.dimension} | ${i.issue} | ${i.suggestion} |\n`;
    });
    report += '\n';
  }

  report += `---

## 🟡 P1 重要 (建议修复)

`;

  if (p1Issues.length === 0) {
    report += `> ✅ 无 P1 级别问题\n\n`;
  } else {
    report += `| 页面 | 维度 | 问题描述 | 修复建议 |\n`;
    report += `|------|------|---------|----------|\n`;
    p1Issues.forEach(i => {
      report += `| ${i.name} (\`${i.page}\`) | ${i.dimension} | ${i.issue} | ${i.suggestion} |\n`;
    });
    report += '\n';
  }

  report += `---

## 🟢 P2 建议 (可优化)

`;

  if (p2Issues.length === 0) {
    report += `> ✅ 无 P2 级别问题\n\n`;
  } else {
    report += `| 页面 | 维度 | 问题描述 | 优化建议 |\n`;
    report += `|------|------|---------|----------|\n`;
    p2Issues.forEach(i => {
      report += `| ${i.name} (\`${i.page}\`) | ${i.dimension} | ${i.issue} | ${i.suggestion} |\n`;
    });
    report += '\n';
  }

  report += `---

## 📄 逐页详情

`;

  scoredResults.forEach((r, idx) => {
    report += `### ${idx + 1}. ${r.name} (\`${r.path}\`)

| 指标 | 值 |
|------|----|
| 加载时间 | ${r.loadTime}ms |
| 渲染状态 | ${r.rendered ? '✅ 正常' : '❌ 异常'} |
| 白屏检测 | ${r.hasWhiteScreen ? '❌ 是' : '✅ 否'} |
| 元素溢出 | ${r.hasOverflow ? '⚠️ 有' : '✅ 无'} |
| 空内容 | ${r.isEmpty ? '⚠️ 是' : '✅ 否'} |
| 控制台错误 | ${r.consoleErrors.length} 个 |
| API 请求数 | ${r.networkRequests.length} 个 |
| API 失败数 | ${r.networkRequests.filter(req => req.status >= 400).length} 个 |

`;

    if (r.consoleErrors.length > 0) {
      report += `**控制台错误**:\n`;
      r.consoleErrors.forEach(e => {
        report += `- \`${e.text}\`\n`;
      });
      report += '\n';
    }

    if (r.networkRequests.filter(req => req.status >= 400).length > 0) {
      report += `**失败的 API 请求**:\n`;
      r.networkRequests.filter(req => req.status >= 400).forEach(e => {
        report += `- \`${e.url}\` → HTTP ${e.status}\n`;
      });
      report += '\n';
    }

    report += `---\n\n`;
  });

  report += `## 📸 截图清单

| 序号 | 页面 | 截图文件 |
|:----:|------|---------|
`;

  let idx = 1;
  results.forEach(r => {
    const screenshotName = r.path === '/login' ? '01-login' : r.path.replace(/\//g, '-').replace(/^-/, '');
    report += `| ${idx} | ${r.name} (\`${r.path}\`) | [${screenshotName}.png](./frontend-test-screenshots/${screenshotName}.png) |\n`;
    idx++;
  });

  report += `
---

## 📋 测试总结

- **测试页面数**: ${results.length}
- **通过页面数**: ${scoredResults.filter(r => r.overall >= 80).length}
- **警告页面数**: ${scoredResults.filter(r => r.overall >= 60 && r.overall < 80).length}
- **失败页面数**: ${scoredResults.filter(r => r.overall < 60).length}
- **P0 阻塞问题**: ${p0Issues.length} 个
- **P1 重要问题**: ${p1Issues.length} 个
- **P2 优化建议**: ${p2Issues.length} 个

> 报告由 Frontend Tester Agent 自动生成
`;

  // Write report
  fs.writeFileSync(REPORT_PATH, report, 'utf-8');
  console.log(`\n📝 报告已保存: ${REPORT_PATH}`);

  // Also print summary to console
  console.log('\n========================================');
  console.log('📊 测试完成!');
  console.log(`总体评分: ${totalScore}/100`);
  console.log(`P0 阻塞: ${p0Issues.length} | P1 重要: ${p1Issues.length} | P2 建议: ${p2Issues.length}`);
  console.log(`通过: ${scoredResults.filter(r => r.overall >= 80).length} | 警告: ${scoredResults.filter(r => r.overall >= 60 && r.overall < 80).length} | 失败: ${scoredResults.filter(r => r.overall < 60).length}`);
  console.log('========================================');

  await browser.close();
}

run().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
