# 灵运阁 · 安卓客户端工程 (Lingyun Fortune Android)

本目录为《灵运阁·今日运势》经过移动端全面适配的完整 **Android Studio 原生工程**。

---

## 核心适配亮点
1. **纯原生 WebView 极简封装**：
   - 最终输出 APK 体积仅约 **2MB ~ 3MB**，超轻量，秒开无白屏。
   - 100% 离线运行（所有网页资产已内置于 `app/src/main/assets/index.html`）。
2. **原生相册直存（Native Bridge）**：
   - 生成运势签卡后，点击“保存卡片”，通过 `@JavascriptInterface` 自动调用 Android `MediaStore` 存入手机系统相册（Pictures/LingyunFortune），无需繁琐浏览器下载权限。
3. **原生马达触觉震动反馈**：
   - 摇签出签与塔罗翻牌时，调用原生 `Vibrator` 触发细腻的硬件震动。
   - 432Hz 梵音通过系统 WebView 原生低延迟 Web Audio API 实时合成。
4. **全面屏与手势返回适配**：
   - 完美适配刘海屏与状态栏（`viewport-fit=cover` 与沉浸式透明状态栏）。
   - 深度拦截安卓物理返回键：弹窗打开时先关闭弹窗，非首页时先返回首页，双击返回提示退出应用。

---

## 打包生成 APK 的两种方式

### 方式 A：使用本地 Android Studio（推荐开发者）
1. 启动 **Android Studio**，选择 **Open**，定位并打开 `outputs/android-app` 文件夹。
2. 等待 Gradle 同步完成。
3. 顶部菜单选择 **Build → Build Bundle(s) / APK(s) → Build APK(s)**。
4. 编译完成后，点击右下角 **locate** 即可拿到 `app-debug.apk`，安装到安卓手机即可使用！

### 方式 B：使用 GitHub Actions 在线自动打包（免安装任何开发工具）
1. 将此工程上传至你的 GitHub 仓库。
2. 工程已内置 `.github/workflows/build-apk.yml` 自动化流水线。
3. 代码推送到仓库后，GitHub 虚拟机将在 2~3 分钟内自动编译完成，并在 **Actions → Artifacts** 中提供直接下载的 APK 安装包！
