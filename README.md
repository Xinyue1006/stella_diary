# 小猪向阳日记 🌻

给自己用的 iPhone 日记。日常使用可安装主屏幕离线版，原生原型仍可通过 Expo Go 预览。

## 安装主屏幕离线版

1. 用 iPhone 的 Safari 打开已发布的私人日记网址，登录创建这本日记的 ChatGPT 账号。
2. 轻点「分享」→「添加到主屏幕」。如有「作为网页 App 打开」开关，将它打开。
3. 保持联网，从主屏幕新图标打开一次，等到出现「离线已就绪」。以后可以关掉电脑，在手机离线时继续写。

电脑和 iPhone 使用同一个 ChatGPT 账号打开同一本网页日记。首次使用时，在两台设备上分别联网打开，让「我的 → 私人同步」显示「已同步」。两边已有的文字、照片、草稿和期待日会合并，小猪选择也会同步。离线时可以继续写，下次联网打开时会自动同步。

如果旧日记在 Expo Go，先让网页版完成同步，再从 Expo Go 的「我的」导出完整备份，在网页版的「我的 → 从备份恢复」选择文件。恢复会替换本机资料，再与已同步的云端内容合并。

在仓库根目录运行 `python -m http.server 8000 --bind 127.0.0.1 --directory offline-diary/dist` 可预览本机日记。部署私人同步版时，在 `offline-diary` 运行 `npm run build`，将生成的 Worker 部署到仅限所有者访问的 ChatGPT Site，并在该 Site 的托管配置里设置 `"r2": "BUCKET"`。同步接口使用 Sites 提供的访客身份。

## 通过 Expo Go 预览原生原型

1. 在 iPhone 的 App Store 安装 [Expo Go](https://apps.apple.com/my/app/expo-go/id982107779)。
2. iPhone 和这台 Windows 电脑连接同一个 Wi-Fi。
3. 首次使用时，在电脑的 `mobile` 文件夹中执行 `npm ci` 安装依赖，再执行 `npx expo login --browser` 登录 Expo。手机 Expo Go 右上角头像中登录同一个账号。
4. 双击本文件旁的 `启动日记.cmd`，保留终端与电脑运行；也可以在 `mobile` 文件夹打开终端执行 `npm start`。
5. 打开 Expo Go，在首页的 **Development servers** 中点这台电脑上的日记项目。也可以用 iPhone 相机扫描终端二维码。下次继续写时，保持电脑服务运行，在同一 Wi-Fi 上从 Expo Go 首页点开即可。

当前 iOS Expo Go 要求电脑和手机均已登录同一 Expo 账号，见 [Expo 官方说明](https://expo.dev/changelog/expo-go-57-login)。这不需要 Apple 开发者付费会员。

公司、酒店或访客 Wi-Fi 可能隔离设备，导致扫码后连接失败；先换到同一普通家庭 Wi-Fi。若 Windows 弹出防火墙提示，允许 Node 在你信任的专用网络通信即可。

## 第一版功能

- 一天多条记录，发生时间可回填，创建时间另存。
- 随手写文字、添加照片、自动保留未发表草稿。
- 编辑、删除、按日期与关键词回看。
- 期待的倒数日与已经过去的纪念日。
- 在「我的」选择陪伴小猪。青色恐龙叫憨批批，红色瓢虫叫憨弟弟，紫色蝴蝶叫憨妹妹，白色奶牛叫憨姐姐，黄色蜜蜂叫憨轩轩，粉色兔子叫憨悦悦。
- 本机保存。备份包含文字、照片和设置，可导入恢复。

## 本机与 iCloud

“我的”中选择导出备份，在 iOS 分享表选“存储到文件”，再选自己的 iCloud Drive。导入时选择之前的备份文件。当前是手动备份，不是 CloudKit 自动同步；打开分享表并不代表文件已经保存。

备份文件含私人文字和照片，请存到你自己的位置。当前没有额外的应用密码或端到端加密功能。

当前预览版每条最多 12 张照片、每张最多 6 MB。完整备份文件最多 40 MB，其中照片合计最多 24 MB；超出时会明确提示，不能把此原型当作无限容量的长期相册。正式长期使用前应改进大容量备份。

Expo Go 是预览工具：记录保存在该项目的手机沙盒中，卸载宿主或清除数据可能丢失。迁移到独立 App 前先导出备份，再在新 App 导入。此阶段建议先用测试内容熟悉功能。

## 以后成为独立 App

可从 Windows 用 EAS 云端构建，按本人 iPhone 的设备登记做私人 Ad Hoc 安装，不需要公开上架。Apple 开发者签名通常需要付费会员（标准 99 美元/年或当地定价），签名会到期，需要维护。`mobile/eas.json` 只是准备好的配置，当前没有创建 EAS 项目、上传源代码、构建或签名。

## 验证与开发

在 `mobile` 中运行：

```powershell
npm run typecheck
npm run lint
npm test
npx expo-doctor
```

Windows 没有 iOS 模拟器。这些检查不能代替真机上的照片选择、iCloud Drive 分享/导入、键盘遮挡和关闭重开后的保存验证。

日记里的六款角色图由内置 imagegen 参考用户提供的玩偶实拍生成。透明 PNG 保存在 `mobile/assets/mascots/real-plush/`，各款使用的参考照片编号、完整提示词和输出路径记录在 `Design/real-plush-prompts.json`。

原生版通过了 TypeScript、lint、6 项数据领域测试、Expo Doctor 的 20 项检查和 iOS Hermes bundle 导出。离线网页版在 WebKit 和 Chrome 中验证了断网重开、保存、刷新读取和备份迁移。
