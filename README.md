# 星运灵签 · Android / 离线 Web

当前源码版本：1.0.7（versionCode 7）。原生Kotlin宿主 + 同一套本地HTML/CSS/JS资源，支持Android 7.0以上、已更新的Android System WebView（建议86以上）。不申请网络和外部存储权限。

## 功能与数据边界

- 十二星座/十二生肖：按本地日期与所选ID生成稳定的娱乐指数和文案，跨日及回到前台刷新。没有真实星盘、行星过境或预测准确性承诺。
- 黄历：内置MIT许可的lunar-javascript 1.7.7，离线计算农历、节气、干支、宜忌、方位和时辰。生肖按农历新年，月干支随节气。支持1900—2100年，时间来自设备系统时钟，不做联网校时。
- 灵签：100条本地整理的娱乐签文，部分诗句复用；不是经校验的观音/关帝古籍库。每日一次，保存当天结果。
- 塔罗：22张大牌 + 56张小牌，正逆位解读；从完整牌库洗出7张候选牌供直觉选择。插画目前为本地符号风格，不宣称已包含78幅原画。
- 心愿：1—50个Unicode码点，主题、日期和文本实际存储，累计灯数由记录计算。最多1000条，可导出和逐条删除；展示预置祝福时明确标记其来源。
- 日记录保留最近90个日期。纯离线每日限制依赖系统日期，无法阻止用户改时间、清除数据或卸载。
- Android：Android Keystore + AES-GCM + AtomicFile保存状态，禁用备份。网页预览使用localStorage，未加密；导出JSON备份也是明文。
- Android 10+将图片写入相册；Android 7—9通过系统“创建文档”选择保存位置，无需存储权限。分享只授权特定缓存文件。
- 动效可关闭，跟随系统减少动态效果与省电模式。原生在可用模式中申请最高不超过120Hz，省电模式选择不超过60Hz；这不是实际120fps或1.5秒冷启动达标证明。

## 唯一业务入口

`app/src/main/assets/index.html` 是APK与预览的共同入口：

| 文件 | 职责 |
| --- | --- |
| app.css | 页面布局、玻璃视觉、安全区、减少动态效果 |
| data.js | 签库、牌库、星座生肖与文案 |
| engine.js | 日期、黄历、确定性日运、状态校验与每日抽取 |
| app.js | 页面交互、存储、生命周期、音效、海报 |
| vendor/lunar.js | 固定版本离线历法依赖，许可见vendor/LICENSE |
| MainActivity.kt | 安全WebView、系统边距/输入法、传感器、返回与省电模式 |
| WebAppInterface.kt | 原生存储、保存和分享桥 |
| PrivateStore.kt | 加密状态与原子写入 |

`preview.html` 通过iframe加载上述入口。主题按钮只改变受限的CSS变量，不再复制业务逻辑。

在此项目目录运行 `python3 scripts/export-previews.py`，可更新父目录的daily-fortune.html与theme-showcase.html。这两个文件是预览入口，必须与android-app目录一起保留，不再宣称是无依赖的单文件应用。

外层历史Python生成器已改为此导出命令的兼容入口；不会回写应用资产。旧源码保存在父目录的legacy-generators-before-1.0.7.zip，旧app_interaction.js不再是可编辑的有效入口。

## 验证

需要Node 22.13以上和pnpm 11.25.0：

```sh
corepack enable
pnpm install --frozen-lockfile --ignore-scripts
pnpm exec playwright install chromium
pnpm run check
```

如果使用已安装的Chrome，可设置CHROME_PATH；macOS默认检查标准Chrome路径。测试结果与截图写入test-results/。

`pnpm run check` 重建离线历法副本并运行：
- 9组数据/历法/持久化单元测试。
- 浏览器回归：24种切换、生日、重载、求签、塔罗、海报、心愿、安全输入、跨日、触控、小屏安全区、存储失败/损坏、离线与四主题预览。

当前浏览器测试使用Chrome，不能代替Android加密、传感器、SAF、真实导航栏/输入法和性能验证。

## Android构建

安装JDK17及Android SDK（platforms;android-34、build-tools;34.0.0），通过ANDROID_HOME或local.properties配置SDK路径：

```sh
./gradlew lintDebug testDebugUnitTest assembleDebug
```

完整Gradle8.4 wrapper已补齐；wrapper JAR与发行包均配置官方SHA-256校验。Debug包仅供开发验证，不发布到Release，也不保证与旧Debug包覆盖兼容。

正式包必须提供以下环境变量，缺失时签名验证会失败，不自动降级为Debug签名：

```text
ANDROID_KEYSTORE_PATH
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

配置后运行 `./gradlew assembleRelease`，并使用Android SDK的apksigner进行完整验签。密钥存放在仓库外，妥善保存备份；不要提交密钥或把密码写入脚本。

## GitHub Actions与发布

普通push/PR：先跑浏览器回归，再跑Android lint/单元测试，只上传标明Debug的开发构建物。

版本标签必须与app/build.gradle.kts的versionName一致。正式发布需要在GitHub仓库Secrets配置：

| Secret | 内容 |
| --- | --- |
| ANDROID_KEYSTORE_BASE64 | 固定发布keystore文件的Base64 |
| ANDROID_KEYSTORE_PASSWORD | keystore密码 |
| ANDROID_KEY_ALIAS | 固定别名 |
| ANDROID_KEY_PASSWORD | 对应密钥密码 |
| ANDROID_SIGNING_CERT_SHA256 | 预期证书SHA-256（apksigner输出或keytool证书指纹） |

标签构建校验版本、完整APK签名和预期证书指纹后，发布任务仅上传当前标签的APK与SHA256SUMS.txt。不覆写历史Release；标签已发布时失败退出，需要新版本号/新标签。

现有本地1.0.0与1.0.6 Debug包的证书不同。源码修改不能改变已安装旧包的签名；没有原私钥就不能实现无缝覆盖升级。发布前应明确迁移安装方式并保存可导出的记录。本次修复未生成或替换正式keystore；提交源码不代表已构建或发布APK，构建与发布结果以对应提交的GitHub Actions记录为准。

## 1.0.7本地验证记录（提交前）

已通过9组数据单元测试、16组浏览器回归、Android XML解析、CI YAML/12段shell语法检查与git diff --check。此机器缺少JDK/Android SDK，Google SDK/Maven下载端点访问超时；没有完成Gradle编译、Android lint或真机安装。因此当前交付是已修复源码与网页验证结果，不是已验证的新APK。

这不是完整PRD验收：目前正向文案基础库10条、预置祝福5条，未达到500句/1000条规模；未使用Room/DataStore，采用上述加密文件存储；未完成78幅原画、首启强制引导及性能基准验收。

父目录原有APK仍是1.0.6，不能当成此次修复版本。没有修改那些历史二进制文件。

Git remote中的明文凭据已从本地配置移除。若此前披露的Token仍有效，需要在GitHub账号设置中撤销；删除本地配置不会使远端凭据自动失效。
