<p align="center">
  <img src="assets/hero.svg" width="100%" alt="voltdex - AI 助手的非官方寶可夢資料圖鑑">
</p>

<p align="center">
  <a href="https://github.com/cain19811028/voltdex"><img src="https://img.shields.io/badge/Pok%C3%A9mon-1025%20species%20%2B%20220%20forms-FF5A1F?style=flat-square" alt="1025 種寶可夢與 220 種形態"></a>
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-Ready%20(Stdio)-00F0FF?style=flat-square&logo=anthropic&logoColor=black" alt="MCP Server"></a>
  <a href="https://claude.ai/"><img src="https://img.shields.io/badge/Claude%20Code-Skill%20Supported-D97757?style=flat-square&logo=claude&logoColor=white" alt="Claude Code Skill"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D%2022-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js"></a>
  <a href="#-voltdex---benchmark-token-瘦身大作戰"><img src="https://img.shields.io/badge/Payload-564%20B%20vs%20450%20KB-10B981?style=flat-square" alt="回應大小：564 bytes 對 450 KB"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <b>繁體中文</b>
</p>

---

### `$ voltdex --whoami`

> ⚡ **「替你的 AI 助手充飽電的隨身圖鑑。」**

**`voltdex`** 是專為 **AI Coding Agent（Claude Code、Cursor、Gemini CLI 等）** 量身打造的非官方**超輕量寶可夢資料 MCP Server & Skill 雙模工具**。  
吉祥物 Spark 是一團住在圖鑑裡的小電光，每一次查詢都由它供電。

AI 助手原本要呼叫好幾次 [PokéAPI](https://pokeapi.co/) 才拼得出來的資訊：**四種語言的名稱、屬性、種族值與屬性相剋**，voltdex 用一個小小的回應就給齊，不必讀進約 450 KB 的原始 JSON。它也能用中文名稱查詢：PokéAPI 的 `/pokemon` 端點只接受英文識別名或編號，`/pokemon/噴火龍` 會直接回 404。

---

### `$ voltdex --features`

- 🌐 **多國語言離線查詢（繁中 / 簡中 / 英文 / 日文 / 全國圖鑑編號）**
  - 內建離線索引，收錄第 1～9 世代全部 **1025 種寶可夢**，以及屬性或種族值不同的 **220 種形態**（清洗洛托姆、阿羅拉九尾、超級噴火龍Ｘ⋯）。
  - 輸入 `噴火龍`、`皮卡丘`、`リザードン`、`charizard`、`25` 或 `清洗洛托姆` 都在本機查詢，**不需任何網路請求**：索引載入約 7 ms，之後每次查詢不到 1 ms。
  - 部分名稱同時符合好幾隻時（例如 `char`、`火`），會列出候選，不會亂猜一隻。
- ⚡ **回應精簡，不用讀整包 API 原始資料**
  - PokéAPI 的 `GET /pokemon/charizard` 回傳約 370 KB 的 JSON（包含各代招式表、遊戲索引等）；多語名稱還要再從 `/pokemon-species` 拿約 35 KB。
  - 同一隻寶可夢，`voltdex` 只回 **139 bytes**（`--brief`）或 **564 bytes**（MCP JSON），Token 用量也跟著等比例下降。
- 🛡️ **戰鬥數值與屬性相剋**
  - 六維種族值（HP / 物攻 / 物防 / 特攻 / 特防 / 速度）與總和（BST）。
  - 自動計算防禦面的屬性相剋倍率（4x、2x、0.5x、0.25x、0x）。只依屬性計算，不考慮漂浮等特性。
- 🎨 **用真正的圖，不讓生圖模型亂畫**
  - 從 [PokeAPI/sprites](https://github.com/PokeAPI/sprites) 下載 **官方立繪（475×475 PNG）**、**Showdown 戰鬥動態 GIF**、**第三世代綠寶石像素圖**，以及 **色違（Shiny）** 版本。其中部分圖組是粉絲製作的，包括官方立繪的色違版；詳見 [`--sprites`](#-voltdex---sprites-立繪與外觀支援)。
- 🔌 **雙模一體（Dual-Mode: MCP Server + Skill）**
  - 既可以作為 **MCP Server** 讓 Claude / Cursor 原生調用工具；也可以作為 **Skill 腳本** 隨插即用。

---

### `$ voltdex --benchmark (Token 瘦身大作戰)`

當 AI 助手需要一隻寶可夢的名稱、屬性、種族值與屬性相剋時（以噴火龍為例，2026-10-11 實測）：

| | PokéAPI REST API (`pokeapi.co`) | `voltdex` |
| :--- | :--- | :--- |
| **請求次數** | 4 次：`/pokemon`、`/pokemon-species`，以及兩個屬性各一次 `/type` | **0 次**（離線索引） |
| **回應大小** | 371,588 + 34,727 + 21,109 + 22,915 bytes ≈ **450 KB** | **139 B**（`--brief`）· **564 B**（MCP）· 1,023 B（CLI JSON，含縮排） |
| **用名稱查詢** | 只接受英文識別名或編號；`/pokemon/噴火龍` 會回 404 | 英文、繁中、簡中、日文名稱，或全國圖鑑編號 |
| **耗時** | 每次請求一趟網路往返（在我們的測試機上每次 0.3～0.6 秒） | MCP server 內每次查詢不到 1 ms；CLI 每次約 0.1 秒，大多是 Node.js 啟動時間 |
| **屬性相剋** | 要自己合併每個 `/type` 的傷害關係 | 直接算好 4x / 2x / 0.5x / 0.25x / 0x |

PokéAPI 的回應會隨資料增加而變大，耗時也會因網路和機器而不同。

---

### `$ voltdex query 噴火龍 --output demo`

#### 1. 結構化 JSON（MCP `lookup_pokemon`，加上換行方便閱讀）
```json
{
  "id": 6, "slug": "charizard", "en": "Charizard", "zh_tw": "噴火龍", "zh_cn": "喷火龙", "ja": "リザードン",
  "types": ["fire", "flying"],
  "stats": { "hp": 78, "atk": 84, "def": 78, "spa": 109, "spd": 85, "spe": 100, "bst": 534 },
  "forms": ["charizard-mega-x", "charizard-mega-y"],
  "weaknesses": { "4x": ["rock"], "2x": ["water", "electric"], "0.5x": ["fire", "fighting", "steel", "fairy"], "0.25x": ["grass", "bug"], "0x": ["ground"] },
  "stab_coverage": ["grass", "ice", "bug", "steel", "fighting"],
  "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png"
}
```
CLI 預設輸出（`--json`）欄位相同但有縮排，另外多了 `types_zh`、`stab_coverage_zh`、`sprite_style` 與 `is_shiny`。

#### 2. 超緊湊單行模式 (`--brief`，極致壓榨 Token)
```bash
$ node index.mjs 噴火龍 --brief
#006 噴火龍 (Charizard) | 火/飛行 | BST:534 (HP:78 攻:84 防:78 特攻:109 特防:85 速:100) | 弱點: 岩石(4x), 水(2x), 電(2x) | 免疫: 地面(0x)
```

---

### `$ voltdex --install (安裝與整合指南)`

`voltdex` 支援隨插即用的 Agent Skill 與標準 MCP Server 兩種整合方式：

#### 方案 A：作為 Agent 技能（Claude Code / Cursor / 專案 Skills）
先將專案 Clone 至本機：
```bash
git clone https://github.com/cain19811028/voltdex.git
```
接著複製（或建立 Symlink 捷徑）至你的目標技能目錄：
```bash
# 1. 全域安裝給 Claude Code：
cp -r voltdex ~/.claude/skills/voltdex

# 2. 全域安裝給 Cursor：
cp -r voltdex ~/.cursor/skills/voltdex

# 3. 安裝給 Google Antigravity / Gemini CLI：
cp -r voltdex ~/.gemini/antigravity-ide/skills/voltdex

# 4. 或整合至你的特定專案 / AI 工作區的 skills 目錄：
cp -r voltdex ./.agents/skills/voltdex
```
AI Agent 將根據目錄中的 [`SKILL.md`](SKILL.md) 自主調用工具。

#### 方案 B：作為 MCP Server（Model Context Protocol）
在你的 Claude Desktop / Claude Code 或專案的 MCP 設定檔（例如 `~/.claude.json` 或專案 `.mcp.json`）中加入：

```json
{
  "mcpServers": {
    "voltdex": {
      "command": "node",
      "args": ["/path/to/voltdex/index.mjs", "--mcp"],
      "env": { "VOLTDEX_OUTPUT_DIR": "/path/to/your/sprites" }
    }
  }
}
```
> 💡 *Windows 使用者請替換為實際路徑，如 `"C:/tools/voltdex/index.mjs"`。*

> 🔒 *`download_sprite` 只會寫入 `VOLTDEX_OUTPUT_DIR`（未設定時為 server 的工作目錄）之內，不會經由 symlink 寫到外面，也不會覆蓋既有檔案（除非呼叫時帶 `overwrite: true`）。若該目錄是檔案系統根目錄（部分 MCP client 會以此為工作目錄），會直接拒絕寫入。*

---

### `$ voltdex --sprites (立繪與外觀支援)`

| 參數值 | 樣式說明 | 預覽示例 |
| :--- | :--- | :--- |
| `--sprite official` | **官方立繪，透明背景 PNG（475×475）** *(預設)* | 高解析宣傳與卡片展示 |
| `--sprite showdown` | **Pokémon Showdown 戰鬥動態 GIF**（Smogon 社群製作） | 網頁對戰動畫效果 |
| `--sprite gen3` | **GBA 第三世代《綠寶石》像素圖**（僅第 1～3 世代，其餘退回 `official`） | 經典復古風格 |
| `--sprite default` | **96×96 正面像素圖**（第 9 世代為粉絲製作） | 輕量小圖示使用 |
| `--shiny` | **附加旗標：色違版本。** 搭配 `official` 時是粉絲重新上色的版本，不是官方立繪 | 金色鯉魚王、黑噴火龍 |
| `--force` | **附加旗標：`--out` 檔案已存在時覆蓋** | 重新下載立繪 |

```bash
# 下載色違噴火龍（粉絲依官方立繪重新上色的版本）
node index.mjs 噴火龍 --sprite official --shiny --out charizard_shiny.png
```

---

### `$ voltdex --license & 免責聲明`

- **授權**：原始碼與原創美術以 [MIT License](LICENSE) 授權 © 2026 [cain19811028](https://github.com/cain19811028)，不涵蓋下方所述的第三方資料與圖像。
- **名稱與吉祥物**：voltdex 名稱與吉祥物 Spark 用於識別本專案，MIT 授權不包含將它們作為品牌使用的權利；歡迎 fork，但請使用你自己的名稱。
- **商標聲明**：寶可夢（Pokémon）及寶可夢角色名稱為 **Nintendo、Creatures Inc.、GAME FREAK Inc. 及 The Pokémon Company** 的商標。
- **非官方聲明**：本專案為獨立、非營利的粉絲專案，與上述公司**無任何隸屬、贊助或背書關係**。
- **資料與圖像**：`data/pokedex.json` 為衍生自 [PokéAPI](https://pokeapi.co/)（BSD 3-Clause）的事實性參考資料。本 repo **不含任何寶可夢圖像**；立繪是在使用者要求時才從 [PokeAPI/sprites](https://github.com/PokeAPI/sprites) 下載，並非由本專案授權給你，權利仍屬原權利人，使用方式由你自行負責。
- **完整說明**：請見 [NOTICE.md](NOTICE.md) 與 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
- **權利人聯絡**：權利人若對內容有疑慮，請[開 Issue](https://github.com/cain19811028/voltdex/issues) 告知，將盡速處理，必要時直接移除。
