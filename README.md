# CS2 LAN C4 Timer

一个基于 CS2 Game State Integration（GSI）的 C4 倒计时工具。**在游戏电脑上启动一次，同一局域网的手机、平板和其他电脑即可通过浏览器查看剩余时间。**

无需在查看设备上安装客户端，也无需将网页部署到云服务器。

## 特点

- **局域网多设备访问**：运行后输出局域网访问地址，其他设备打开网页即可查看；中途打开也会同步当前计时。
- **自动开始计时**：收到 C4 安放状态后启动 40 秒倒计时，重复消息不会重置。
- **拆除结果保留**：拆除时冻结剩余时间，以蓝色数字和圆圈显示“炸弹已拆除”，直到下一回合开始。
- **自动清理状态**：其他回合结束、炸弹爆炸或退出对局后，恢复“炸弹未安放”。
- **轻量运行**：使用 Node.js 标准库，无第三方依赖；网页支持手机屏幕，断连后自动重连。

## 快速开始

### 1. 下载并启动

安装 Node.js 18 或更新版本，然后下载本仓库，或执行：

```sh
git clone https://github.com/F0rest-csgo/cs2-lan-c4-timer.git
cd cs2-lan-c4-timer
node server.js
```

Windows 用户也可以双击 `start.cmd`。无需运行 `npm install`。保持终端打开，按 Ctrl+C 停止服务。

### 2. 配置 CS2

将 `gamestate_integration_c4_timer.cfg` 复制到：

```text
<Steam 游戏库>\steamapps\common\Counter-Strike Global Offensive\game\csgo\cfg\
```

可在 Steam 中右键 CS2 → 管理 → 浏览本地文件，然后进入 `game\csgo\cfg`。保留文件名，确认没有额外的 `.txt` 后缀。重启 CS2 后配置会自动加载，无需在控制台执行 `exec`。

### 3. 在局域网其他设备上查看

启动服务后，终端会输出类似地址：

```text
本机：http://localhost:3000
局域网：http://192.168.1.10:3000
```

在游戏电脑上打开本机地址；手机、平板或另一台电脑连接同一局域网后，打开输出的**局域网地址**。其他设备上的 `localhost` 指向设备自身，因此请使用游戏电脑的 IP 地址。

如 Windows 防火墙询问是否允许 Node.js 访问网络，允许专用网络访问。如果无法连接，检查设备是否处于同一局域网，以及路由器是否启用了访客网络或设备隔离。

## 网页状态

| 状态 | 显示 |
| --- | --- |
| 炸弹未安放 | 等待安放，无倒计时 |
| C4 已安放 | 剩余时间和进度圆圈，最后 10 秒变为红色 |
| 炸弹已拆除 | 蓝色数字与圆圈，保留拆除时的剩余时间 |
| 等待回合结果 | 时间归零，等待游戏推送最终结果 |

下一回合的冻结时间开始时，拆除结果会清除。页面还会显示游戏连接状态，并在服务连接中断时自动重连。

## 工作原理

```text
CS2 → GSI HTTP POST → 游戏电脑上的 Node.js 服务
                              ↓
                    局域网设备浏览器查看倒计时
```

- `gamestate_integration_c4_timer.cfg`：告诉游戏向 `http://127.0.0.1:3000/gsi` 推送状态。
- `server.js`：接收 JSON、校验请求，提供网页和 `/api/state` 接口。
- `timer.js`：根据状态启动、停止或清除计时。
- `public/index.html`：每 500 毫秒同步服务状态，并在浏览器中绘制倒计时。

服务使用单调时钟计算剩余时间。网页服务监听 `0.0.0.0`，供局域网访问；GSI 更新接口只接受本机请求，并校验配置中的 token。

## 计时与数据限制

- 固定从**收到安放状态**开始计时 40 秒。GSI 推送和网络存在延迟，显示结果可能与游戏实际爆炸时刻存在偏差。
- 自定义服务器即使修改了炸弹时长，本工具仍按 40 秒计时。
- 普通玩家通过 `round.bomb` 识别安放和最终结果；同时兼容观察者的 `bomb.state`。详细炸弹信息受 GSI 的角色权限限制，当前页面不显示“正在拆除”。
- 如果服务在炸弹安放后才启动，首次收到安放状态仍会从 40 秒开始。
- 测试覆盖模拟 GSI 消息和 HTTP 接口；当前 CS2 版本的实际推送行为仍需在游戏中验证。

参考：[Valve GSI 文档](https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive_Game_State_Integration)。

## 自定义配置

默认端口为 `3000`。Windows PowerShell 中可通过环境变量修改：

```powershell
$env:PORT = '8080'
node server.js
```

同时将 cfg 的 `uri` 改为 `http://127.0.0.1:8080/gsi` 并重启游戏。其他设备使用新的网页端口访问。

如需更改 token：

```powershell
$env:GSI_TOKEN = 'your-local-token'
node server.js
```

同时修改 cfg 的 `auth.token`，使两处值一致。

## 开发与测试

```sh
node --test
```

测试覆盖安放、重复推送、拆除结果冻结、回合切换、爆炸、断连、HTTP 接口及网页状态渲染。

欢迎通过 Issues 报告问题。提供操作系统、Node.js 版本、游戏模式和复现步骤，有助于定位问题。

## 开源协议

本项目采用 [MIT License](LICENSE)。
