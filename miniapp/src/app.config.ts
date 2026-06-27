export default {
  pages: [
    'pages/login/index',
    'pages/index/index',
    'pages/public/index',
    'pages/received-shares/index',
    'pages/share-content/index',
    'pages/album-upload/index',
    'pages/camera-upload/index',
    'pages/storage-stats/index',
    'pages/create-share/index',
    'pages/favorites/index',
    'pages/operation-logs/index',
  ],
  window: {
    navigationBarTitleText: '文件管理',
    navigationBarBackgroundColor: '#1677ff',
    navigationBarTextStyle: 'white',
    backgroundColor: '#f5f5f5',
  },
  tabBar: {
    color: '#999999',
    selectedColor: '#1677ff',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '我的备份',
        iconPath: '',
        selectedIconPath: '',
      },
      {
        pagePath: 'pages/public/index',
        text: '公共文件',
        iconPath: '',
        selectedIconPath: '',
      },
      {
        pagePath: 'pages/received-shares/index',
        text: '分享',
        iconPath: '',
        selectedIconPath: '',
      },
    ],
  },
};
