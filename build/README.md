# 打包资源目录

`electron-builder.yml` 里配置了 `directories.buildResources: build`，打包时会从这里取图标等资源。

需要放的文件：

- `icon.ico` —— 256×256 的 Windows 图标，用于安装包、快捷方式和任务栏。

目录为空也能正常打包，只是会使用 Electron 的默认图标。
