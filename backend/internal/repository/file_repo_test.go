package repository

import (
	"testing"

	"local-file-hub/backend/internal/model"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupFileRepoTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	err = db.AutoMigrate(&model.FileInfo{})
	require.NoError(t, err)
	return db
}

// seedFindByUserAndFolderTestData 为 FindByUserAndFolder 测试准备数据
//
// 数据布局：
//
//	userID=1, folderID=10:  file-A (is_delete=0), file-B (is_delete=1)
//	userID=1, folderID=20:  file-C (is_delete=0), file-D (is_delete=0)
//	userID=2, folderID=10:  file-E (is_delete=0)
func seedFindByUserAndFolderTestData(t *testing.T, db *gorm.DB) {
	t.Helper()
	files := []model.FileInfo{
		{ID: 1, UserID: 1, FolderID: 10, FileName: "报告-2026.pdf", SaveName: "s1", FileSize: 100, MD5: "a", FullPath: "/报告-2026.pdf", IsDelete: 0},
		{ID: 2, UserID: 1, FolderID: 10, FileName: "已删除文件.txt", SaveName: "s2", FileSize: 50, MD5: "b", FullPath: "/已删除文件.txt", IsDelete: 1},
		{ID: 3, UserID: 1, FolderID: 20, FileName: "报告-2026.xlsx", SaveName: "s3", FileSize: 200, MD5: "c", FullPath: "/报告-2026.xlsx", IsDelete: 0},
		{ID: 4, UserID: 1, FolderID: 20, FileName: "普通文档.txt", SaveName: "s4", FileSize: 30, MD5: "d", FullPath: "/普通文档.txt", IsDelete: 0},
		{ID: 5, UserID: 2, FolderID: 10, FileName: "报告-2026.ppt", SaveName: "s5", FileSize: 500, MD5: "e", FullPath: "/报告-2026.ppt", IsDelete: 0},
	}
	for _, f := range files {
		require.NoError(t, db.Create(&f).Error)
	}
}

// ======================== FindByUserAndFolder keyword 分支 ========================

func TestFindByUserAndFolder_KeywordEmpty_ShouldFilterByFolderID(t *testing.T) {
	db := setupFileRepoTestDB(t)
	seedFindByUserAndFolderTestData(t, db)
	repo := &FileRepo{DB: db}

	// keyword 为空 → 应包含 folder_id 过滤
	files, total, err := repo.FindByUserAndFolder(
		1,   // userID
		10,  // folderID
		nil, // visibility
		"",  // keyword (空!)
		nil, // fileType
		"createTime", "desc",
		0, 100,
	)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total, "keyword 为空时应只返回 folderID=10 且未删除的文件")
	require.Len(t, files, 1)
	assert.Equal(t, "报告-2026.pdf", files[0].FileName, "应返回 folderID=10 的文件")
	assert.Equal(t, int64(10), files[0].FolderID)
}

func TestFindByUserAndFolder_KeywordNonEmpty_ShouldNotFilterByFolderID(t *testing.T) {
	db := setupFileRepoTestDB(t)
	seedFindByUserAndFolderTestData(t, db)
	repo := &FileRepo{DB: db}

	// keyword 非空 → 不应包含 folder_id 过滤，全分区搜索
	files, total, err := repo.FindByUserAndFolder(
		1,         // userID
		10,        // folderID (keyword 非空时此参数应被忽略)
		nil,       // visibility
		"报告-2026", // keyword (非空!)
		nil,       // fileType
		"createTime", "desc",
		0, 100,
	)
	require.NoError(t, err)
	// userID=1 未删除的文件中，匹配 "报告-2026" 的有:
	//   folderID=10: ID=1 "报告-2026.pdf"
	//   folderID=20: ID=3 "报告-2026.xlsx"
	// 总计 2 条
	assert.Equal(t, int64(2), total, "keyword 非空时应全分区搜索，返回 2 条")
	require.Len(t, files, 2)

	// 验证返回的文件来自不同文件夹
	folderIDs := make([]int64, len(files))
	for i, f := range files {
		folderIDs[i] = f.FolderID
		assert.Contains(t, f.FileName, "报告-2026")
	}
	assert.Contains(t, folderIDs, int64(10))
	assert.Contains(t, folderIDs, int64(20))
}

func TestFindByUserAndFolder_KeywordNonEmpty_RespectsUserIsolation(t *testing.T) {
	db := setupFileRepoTestDB(t)
	seedFindByUserAndFolderTestData(t, db)
	repo := &FileRepo{DB: db}

	// keyword 非空时，依然按 user_id 隔离
	files, total, err := repo.FindByUserAndFolder(
		2,    // userID=2
		10,   // folderID (应被忽略)
		nil,  // visibility
		"报告", // keyword
		nil,  // fileType
		"createTime", "desc",
		0, 100,
	)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total, "userID=2 仅有一条匹配")
	require.Len(t, files, 1)
	assert.Equal(t, int64(2), files[0].UserID)
	assert.Equal(t, "报告-2026.ppt", files[0].FileName)
}

func TestFindByUserAndFolder_KeywordEmpty_OtherFolder(t *testing.T) {
	db := setupFileRepoTestDB(t)
	seedFindByUserAndFolderTestData(t, db)
	repo := &FileRepo{DB: db}

	// folderID=20, keyword 为空
	files, total, err := repo.FindByUserAndFolder(
		1, 20, nil, "", nil, "createTime", "desc", 0, 100,
	)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total, "folderID=20 应有 2 条未删除文件")
	require.Len(t, files, 2)
	for _, f := range files {
		assert.Equal(t, int64(20), f.FolderID)
	}
}

func TestFindByUserAndFolder_KeywordNonEmpty_NoMatch(t *testing.T) {
	db := setupFileRepoTestDB(t)
	seedFindByUserAndFolderTestData(t, db)
	repo := &FileRepo{DB: db}

	files, total, err := repo.FindByUserAndFolder(
		1, 10, nil, "不存在的关键词", nil, "createTime", "desc", 0, 100,
	)
	require.NoError(t, err)
	assert.Equal(t, int64(0), total)
	assert.Empty(t, files)
}

func TestFindByUserAndFolder_KeywordEmpty_ExcludesDeleted(t *testing.T) {
	db := setupFileRepoTestDB(t)
	seedFindByUserAndFolderTestData(t, db)
	repo := &FileRepo{DB: db}

	files, total, err := repo.FindByUserAndFolder(
		1, 10, nil, "", nil, "createTime", "desc", 0, 100,
	)
	require.NoError(t, err)
	assert.Equal(t, int64(1), total)
	require.Len(t, files, 1)
	// 确保已删除的 ID=2 没有被返回
	assert.Equal(t, int64(1), files[0].ID)
	assert.Equal(t, int8(0), files[0].IsDelete)
}

func TestFindByUserAndFolder_KeywordNonEmpty_ExcludesDeleted(t *testing.T) {
	db := setupFileRepoTestDB(t)
	seedFindByUserAndFolderTestData(t, db)
	repo := &FileRepo{DB: db}

	// "已删除" keyword 匹配到 ID=2 (is_delete=1)，但应被排除
	files, total, err := repo.FindByUserAndFolder(
		1, 10, nil, "已删除", nil, "createTime", "desc", 0, 100,
	)
	require.NoError(t, err)
	assert.Equal(t, int64(0), total, "已删除文件不应出现在结果中")
	assert.Empty(t, files)
}
