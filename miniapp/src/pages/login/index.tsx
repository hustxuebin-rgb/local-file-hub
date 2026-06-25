import { View, Text } from '@tarojs/components';
import { useDidShow, useDidHide } from '@tarojs/taro';
import { useState, useCallback } from 'react';
import { Cell, Input, Button, Toast, Dialog, Collapse } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import useAuthStore from '../../stores/authStore';
import { login as loginApi } from '../../utils/api';
import { getApiBaseUrl, setApiBaseUrl, STORAGE_KEYS } from '../../utils/config';
import './index.scss';

interface LoginProps {}

function LoginPage(_props: LoginProps): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl());
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(
    !Taro.getStorageSync(STORAGE_KEYS.SERVER_URL)
  );
  const { login } = useAuthStore();

  useDidShow(() => {
    const token = Taro.getStorageSync('token');
    if (token) {
      Taro.switchTab({ url: '/pages/index/index' });
    }
  });

  useDidHide(() => {});

  // 服务器地址配置
  const handleSaveServerUrl = useCallback(() => {
    const url = serverUrl.trim().replace(/\/$/, '');
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Taro.showToast({ title: '地址需以 http:// 或 https:// 开头', icon: 'none' });
      return;
    }
    setApiBaseUrl(url);
    setShowServerConfig(false);
    Taro.showToast({ title: '服务器地址已保存', icon: 'success' });
  }, [serverUrl]);

  // 连接排查区域展开/收起
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);

  // 扫码连接服务器
  const handleScanCode = useCallback(() => {
    Taro.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
    })
      .then((res) => {
        const url = res.result.trim().replace(/\/$/, '');
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          Taro.showToast({ title: '二维码内容不是有效的服务器地址', icon: 'none' });
          return;
        }
        setApiBaseUrl(url);
        setServerUrl(url);
        setShowServerConfig(false);
        Taro.showToast({ title: '服务器连接成功', icon: 'success' });
      })
      .catch(() => {
        // 用户取消扫码，不做处理
      });
  }, []);

  const handleLogin = useCallback(async () => {
    if (!username.trim()) {
      Taro.showToast({ title: '请输入用户名', icon: 'none' });
      return;
    }
    if (!password.trim()) {
      Taro.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    setLoading(true);
    try {
      const res = await loginApi({
        username: username.trim(),
        password: password.trim(),
        deviceType: 2,
      });
      login(res.token, res.user);
      Taro.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        Taro.switchTab({ url: '/pages/index/index' });
      }, 500);
    } catch (err) {
      // toast 已在 request 中处理
    } finally {
      setLoading(false);
    }
  }, [username, password, login]);

  return (
    <View className="login-page">
      <View className="login-page__header">
        <Text className="login-page__title">local-file-hub</Text>
        <Text className="login-page__subtitle">文件管理助手</Text>
      </View>
      {/* 扫码连接按钮 */}
      <Button
        className="login-page__scan-btn"
        size="large"
        block
        onClick={handleScanCode}
      >
        扫码连接服务器
      </Button>

      <View className="login-page__form">
        {/* 服务器地址配置入口 */}
        <View style={{ marginBottom: 12, textAlign: 'center' }}>
          <Text
            style={{ color: '#999', fontSize: 12, textDecoration: 'underline' }}
            onClick={() => setShowServerConfig(!showServerConfig)}
          >
            服务器: {getApiBaseUrl()}
          </Text>
        </View>
        {showServerConfig && (
          <View style={{ marginBottom: 16, padding: '0 4px' }}>
            <Cell>
              <Input
                placeholder="http://192.168.1.100:8080"
                value={serverUrl}
                onChange={(v) => setServerUrl(v)}
              />
            </Cell>
            <Button
              size="small"
              onClick={handleSaveServerUrl}
              style={{ marginTop: 8 }}
            >
              保存地址
            </Button>
          </View>
        )}
        <Cell>
          <Input
            className="login-page__input"
            placeholder="请输入用户名"
            value={username}
            onChange={(v) => setUsername(v)}
            maxlength={50}
          />
        </Cell>
        <Cell>
          <Input
            className="login-page__input"
            type="password"
            placeholder="请输入密码"
            value={password}
            onChange={(v) => setPassword(v)}
            maxlength={50}
            password
          />
        </Cell>
        <Button
          className="login-page__btn"
          type="primary"
          size="large"
          block
          loading={loading}
          onClick={handleLogin}
        >
          登录
        </Button>

        {/* 连接排查指引 */}
        <View style={{ marginTop: 24 }}>
          <Text
            style={{ color: '#999', fontSize: 12, textDecoration: 'underline', display: 'block', textAlign: 'center' }}
            onClick={() => setShowTroubleshoot(!showTroubleshoot)}
          >
            连接不上？点此排查
          </Text>
          {showTroubleshoot && (
            <View style={{ marginTop: 12, padding: 12, background: '#f5f5f5', borderRadius: 8, fontSize: 13, color: '#666', lineHeight: 2 }}>
              <Text>1. 确保电脑已启动 local-file-hub 服务端</Text>
              <Text>2. 手机和电脑连接同一个 WiFi</Text>
              <Text>3. 电脑上打开浏览器访问 http://local-file-hub.local:5173</Text>
              <Text>4. 扫描 Web 页面上的二维码获取真实 IP 连接</Text>
              <Text>5. 如仍无法连接，手动输入电脑 IP:8080</Text>
            </View>
          )}
        </View>
      </View>
      <Toast />
    </View>
  );
}

export default LoginPage;
