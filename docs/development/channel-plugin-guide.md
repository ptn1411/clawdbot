# Channel Plugin Development Guide

> **Hướng dẫn tạo Channel Plugin cho OpenClaw**
>
> Tài liệu này cung cấp đầy đủ specifications và code mẫu để developers có thể tạo một channel plugin mới tương tự Discord hoặc Telegram.

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Cấu trúc thư mục](#2-cấu-trúc-thư-mục)
3. [Các file bắt buộc](#3-các-file-bắt-buộc)
4. [Plugin Entry Point](#4-plugin-entry-point)
5. [Runtime Module](#5-runtime-module)
6. [Channel Plugin Interface](#6-channel-plugin-interface)
7. [Các thành phần chi tiết](#7-các-thành-phần-chi-tiết)
8. [Code mẫu hoàn chỉnh](#8-code-mẫu-hoàn-chỉnh)
9. [Testing & Debugging](#9-testing--debugging)
10. [Checklist phát triển](#10-checklist-phát-triển)

---

## 1. Tổng quan kiến trúc

### Luồng hoạt động của Channel Plugin

```
┌────────────────────────────────────────────────────────────────────┐
│                         OpenClaw Gateway                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      Plugin Registry                          │  │
│  │                                                               │  │
│  │   register(api) → api.registerChannel({ plugin: myPlugin })  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                               │                                     │
│                               ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      Channel Manager                          │  │
│  │                                                               │  │
│  │   • Quản lý lifecycle (start/stop)                           │  │
│  │   • Route messages đến Agent                                 │  │
│  │   • Xử lý outbound responses                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│                       Your Channel Plugin                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │   index.ts      │  │   runtime.ts    │  │     channel.ts      │ │
│  │   (entry)       │  │   (runtime ref) │  │   (plugin logic)    │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    Platform API (Discord/Telegram/etc.)
```

### Plugin Lifecycle

```
1. Gateway khởi động
   └── Load plugin từ extensions/
       └── Gọi plugin.register(api)
           └── Plugin lưu runtime reference
           └── Plugin đăng ký channel với api.registerChannel()

2. Channel được enable
   └── Gateway gọi gateway.startAccount()
       └── Plugin kết nối tới Platform API
       └── Bắt đầu lắng nghe messages

3. Nhận message
   └── Platform API gửi message
   └── Plugin normalize và forward tới runtime
   └── Agent xử lý và trả response

4. Gửi response
   └── outbound.sendText/sendMedia được gọi
   └── Plugin format và gửi qua Platform API

5. Shutdown
   └── Gateway gọi abort signal
   └── Plugin cleanup connections
```

---

## 2. Cấu trúc thư mục

```
extensions/
└── your-channel/
    ├── index.ts                 # Entry point - đăng ký plugin
    ├── package.json             # Dependencies
    ├── openclaw.plugin.json     # Plugin manifest
    └── src/
        ├── runtime.ts           # Runtime reference management
        └── channel.ts           # Channel plugin implementation
```

---

## 3. Các file bắt buộc

### 3.1 `package.json`

```json
{
  "name": "@openclaw/channel-mychannel",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "types": "index.d.ts",
  "dependencies": {
    "your-platform-sdk": "^1.0.0"
  },
  "peerDependencies": {
    "openclaw": "*"
  }
}
```

### 3.2 `openclaw.plugin.json`

```json
{
  "id": "mychannel",
  "channels": ["mychannel"],
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

> **Lưu ý quan trọng:**
>
> - `id` phải unique và khớp với `plugin.id` trong `index.ts`
> - `channels` là danh sách channel IDs mà plugin cung cấp
> - `configSchema` định nghĩa cấu hình cho plugin (có thể rỗng)

---

## 4. Plugin Entry Point

### `index.ts`

```typescript
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { myChannelPlugin } from "./src/channel.js";
import { setMyChannelRuntime } from "./src/runtime.js";

/**
 * Plugin definition object
 * Đây là entry point chính được OpenClaw load
 */
const plugin = {
  /**
   * Unique identifier cho plugin
   * PHẢI khớp với "id" trong openclaw.plugin.json
   */
  id: "mychannel",

  /**
   * Tên hiển thị của plugin
   */
  name: "MyChannel",

  /**
   * Mô tả ngắn về plugin
   */
  description: "MyChannel messaging platform integration",

  /**
   * Schema cho config (có thể dùng emptyPluginConfigSchema nếu không cần)
   */
  configSchema: emptyPluginConfigSchema(),

  /**
   * Hàm register được gọi khi Gateway load plugin
   * @param api - OpenClaw Plugin API instance
   */
  register(api: OpenClawPluginApi) {
    // 1. Lưu runtime reference để các module khác sử dụng
    setMyChannelRuntime(api.runtime);

    // 2. Đăng ký channel plugin với Gateway
    api.registerChannel({ plugin: myChannelPlugin });
  },
};

export default plugin;
```

---

## 5. Runtime Module

### `src/runtime.ts`

```typescript
import type { PluginRuntime } from "openclaw/plugin-sdk";

/**
 * Module-level variable để lưu runtime reference
 * Được set một lần khi plugin register
 */
let runtime: PluginRuntime | null = null;

/**
 * Set runtime reference
 * Được gọi từ plugin.register()
 */
export function setMyChannelRuntime(next: PluginRuntime): void {
  runtime = next;
}

/**
 * Get runtime reference
 * Sử dụng trong channel.ts để truy cập các services của OpenClaw
 *
 * @throws Error nếu runtime chưa được khởi tạo
 */
export function getMyChannelRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("MyChannel runtime not initialized");
  }
  return runtime;
}
```

### PluginRuntime Interface (Reference)

```typescript
interface PluginRuntime {
  // Channel-specific APIs
  channel: {
    // Các functions cho từng channel type
    mychannel: {
      sendMessage: (
        to: string,
        text: string,
        opts?: SendOptions,
      ) => Promise<SendResult>;
      probeConnection: (token: string, timeout: number) => Promise<ProbeResult>;
      monitorProvider: (opts: MonitorOptions) => Promise<void>;
      // ... other channel-specific functions
    };
    // Text utilities
    text: {
      chunkMarkdownText: (text: string, limit: number) => string[];
    };
  };

  // Config management
  config: {
    writeConfigFile: (cfg: OpenClawConfig) => Promise<void>;
    readConfigFile: () => Promise<OpenClawConfig>;
  };

  // Logging
  logging: {
    shouldLogVerbose: () => boolean;
    shouldLogDebug: () => boolean;
  };
}
```

---

## 6. Channel Plugin Interface

### Interface đầy đủ

```typescript
import type {
  ChannelPlugin,
  ChannelMessageActionAdapter,
} from "openclaw/plugin-sdk";

/**
 * ResolvedAccount type định nghĩa cấu hình account sau khi resolve
 */
interface ResolvedMyChannelAccount {
  accountId: string;
  name?: string;
  enabled: boolean;
  token: string;
  tokenSource: "config" | "env" | "file" | "none";
  config: {
    // Channel-specific config
    dm?: {
      enabled?: boolean;
      policy?: "pairing" | "allowlist" | "open" | "disabled";
      allowFrom?: string[];
    };
    groupPolicy?: "open" | "allowlist" | "disabled";
    groups?: Record<string, GroupConfig>;
    mediaMaxMb?: number;
    historyLimit?: number;
    // ... thêm config fields khác
  };
}

/**
 * Main Channel Plugin export
 */
export const myChannelPlugin: ChannelPlugin<ResolvedMyChannelAccount> = {
  // ... implementation (xem phần 7)
};
```

---

## 7. Các thành phần chi tiết

### 7.1 Meta & Basic Info

```typescript
export const myChannelPlugin: ChannelPlugin<ResolvedMyChannelAccount> = {
  /**
   * Unique channel identifier
   * PHẢI khớp với plugin.id và openclaw.plugin.json
   */
  id: "mychannel",

  /**
   * Channel metadata
   */
  meta: {
    // Tên hiển thị
    displayName: "MyChannel",
    // Icon (emoji hoặc URL)
    icon: "📱",
    // Màu theme (hex)
    themeColor: "#0088cc",
    // Quick start cho allowFrom
    quickstartAllowFrom: true,
  },

  /**
   * Capabilities - Các tính năng channel hỗ trợ
   */
  capabilities: {
    // Các loại chat hỗ trợ
    chatTypes: ["direct", "group", "channel", "thread"],
    // Hỗ trợ polls
    polls: false,
    // Hỗ trợ reactions
    reactions: true,
    // Hỗ trợ threads
    threads: true,
    // Hỗ trợ media (images, files, etc.)
    media: true,
    // Hỗ trợ native slash commands
    nativeCommands: true,
    // Hỗ trợ block streaming
    blockStreaming: false,
  },

  /**
   * Streaming configuration
   */
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },

  /**
   * Config reload triggers
   * Khi các config paths này thay đổi, channel sẽ reload
   */
  reload: { configPrefixes: ["channels.mychannel"] },
};
```

### 7.2 Config Management

```typescript
{
  /**
   * Config schema cho validation
   */
  configSchema: buildChannelConfigSchema(MyChannelConfigSchema),

  /**
   * Config handlers
   */
  config: {
    /**
     * Liệt kê tất cả account IDs từ config
     */
    listAccountIds: (cfg) => listMyChannelAccountIds(cfg),

    /**
     * Resolve account config từ ID
     */
    resolveAccount: (cfg, accountId) =>
      resolveMyChannelAccount({ cfg, accountId }),

    /**
     * Lấy default account ID
     */
    defaultAccountId: (cfg) => resolveDefaultMyChannelAccountId(cfg),

    /**
     * Enable/disable account
     */
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "mychannel",
        accountId,
        enabled,
        allowTopLevel: true,
      }),

    /**
     * Xóa account khỏi config
     */
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "mychannel",
        accountId,
        clearBaseFields: ["token", "name"],
      }),

    /**
     * Kiểm tra account đã được configure chưa
     */
    isConfigured: (account) => Boolean(account.token?.trim()),

    /**
     * Mô tả account cho UI/CLI
     */
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.token?.trim()),
      tokenSource: account.tokenSource,
    }),

    /**
     * Lấy danh sách allowFrom entries
     */
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveMyChannelAccount({ cfg, accountId }).config.dm?.allowFrom ?? [])
        .map((entry) => String(entry)),

    /**
     * Format allowFrom entries cho storage
     */
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.toLowerCase()),
  },
}
```

### 7.3 Security & Access Control

```typescript
{
  /**
   * Pairing configuration cho DM access
   */
  pairing: {
    // Label cho user ID field
    idLabel: "myChannelUserId",

    // Normalize allowlist entry (remove prefixes, etc.)
    normalizeAllowEntry: (entry) => entry.replace(/^(mychannel|mc):/i, ""),

    // Notify user khi pairing được approve
    notifyApproval: async ({ cfg, id }) => {
      const { token } = getMyChannelRuntime().channel.mychannel.resolveToken(cfg);
      if (!token) throw new Error("mychannel token not configured");
      await getMyChannelRuntime().channel.mychannel.sendMessage(
        id,
        PAIRING_APPROVED_MESSAGE,
        { token }
      );
    },
  },

  /**
   * Security policies
   */
  security: {
    /**
     * Resolve DM policy cho một account
     */
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        cfg.channels?.mychannel?.accounts?.[resolvedAccountId]
      );
      const basePath = useAccountPath
        ? `channels.mychannel.accounts.${resolvedAccountId}.`
        : "channels.mychannel.";

      return {
        // Policy type
        policy: account.config.dm?.policy ?? "pairing",
        // Allowed senders
        allowFrom: account.config.dm?.allowFrom ?? [],
        // Config path cho policy
        policyPath: `${basePath}dmPolicy`,
        // Config path cho allowFrom
        allowFromPath: basePath,
        // Hint message cho pairing approval
        approveHint: formatPairingApproveHint("mychannel"),
        // Normalize entry function
        normalizeEntry: (raw) => raw.replace(/^(mychannel|mc):/i, ""),
      };
    },

    /**
     * Thu thập security warnings
     */
    collectWarnings: ({ account, cfg }) => {
      const warnings: string[] = [];
      const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";

      if (groupPolicy === "open") {
        warnings.push(
          `- MyChannel groups: groupPolicy="open" allows any member to trigger. ` +
          `Set channels.mychannel.groupPolicy="allowlist" to restrict.`
        );
      }

      return warnings;
    },
  },

  /**
   * Group settings resolvers
   */
  groups: {
    // Có yêu cầu mention trong group không
    resolveRequireMention: resolveMyChannelGroupRequireMention,
    // Tool policy cho groups
    resolveToolPolicy: resolveMyChannelGroupToolPolicy,
  },

  /**
   * Mention patterns để strip khỏi message
   */
  mentions: {
    stripPatterns: () => ["@\\w+"],
  },
}
```

### 7.4 Messaging

```typescript
{
  /**
   * Threading configuration
   */
  threading: {
    // Reply-to mode: "off" | "first" | "all"
    resolveReplyToMode: ({ cfg }) =>
      cfg.channels?.mychannel?.replyToMode ?? "first",
  },

  /**
   * Messaging utilities
   */
  messaging: {
    // Normalize target address
    normalizeTarget: normalizeMyChannelMessagingTarget,

    // Target resolver config
    targetResolver: {
      // Function để check nếu input trông giống target ID
      looksLikeId: looksLikeMyChannelTargetId,
      // Hint cho user về format
      hint: "<chatId|user:ID>",
    },
  },

  /**
   * Directory integration (contacts/groups listing)
   */
  directory: {
    // Lấy thông tin bot/self
    self: async () => null,
    // Liệt kê peers từ config
    listPeers: async (params) => listMyChannelDirectoryPeersFromConfig(params),
    // Liệt kê groups từ config
    listGroups: async (params) => listMyChannelDirectoryGroupsFromConfig(params),
  },

  /**
   * Outbound message sending
   */
  outbound: {
    // Delivery mode: "direct" | "queued"
    deliveryMode: "direct",

    // Text chunker function (null = no chunking)
    chunker: (text, limit) =>
      getMyChannelRuntime().channel.text.chunkMarkdownText(text, limit),

    // Chunker mode: "markdown" | "plain"
    chunkerMode: "markdown",

    // Max characters per message chunk
    textChunkLimit: 4000,

    // Max poll options (nếu hỗ trợ polls)
    pollMaxOptions: 10,

    /**
     * Gửi text message
     */
    sendText: async ({ to, text, accountId, deps, replyToId, threadId }) => {
      const send = deps?.sendMyChannel ??
        getMyChannelRuntime().channel.mychannel.sendMessage;

      const result = await send(to, text, {
        verbose: false,
        replyToMessageId: replyToId ? parseInt(replyToId, 10) : undefined,
        messageThreadId: threadId ? parseInt(threadId, 10) : undefined,
        accountId: accountId ?? undefined,
      });

      return { channel: "mychannel", ...result };
    },

    /**
     * Gửi message với media attachment
     */
    sendMedia: async ({ to, text, mediaUrl, accountId, deps, replyToId, threadId }) => {
      const send = deps?.sendMyChannel ??
        getMyChannelRuntime().channel.mychannel.sendMessage;

      const result = await send(to, text, {
        verbose: false,
        mediaUrl,
        replyToMessageId: replyToId ? parseInt(replyToId, 10) : undefined,
        messageThreadId: threadId ? parseInt(threadId, 10) : undefined,
        accountId: accountId ?? undefined,
      });

      return { channel: "mychannel", ...result };
    },

    /**
     * Gửi poll (nếu hỗ trợ)
     */
    sendPoll: async ({ to, poll, accountId }) =>
      await getMyChannelRuntime().channel.mychannel.sendPoll(to, poll, {
        accountId: accountId ?? undefined,
      }),
  },
}
```

### 7.5 Message Actions (Tool Integration)

```typescript
{
  /**
   * Message action adapter cho tools
   * Cho phép agent thực hiện các actions như react, send, delete
   */
  actions: {
    /**
     * Liệt kê các actions có sẵn
     */
    listActions: (ctx) =>
      getMyChannelRuntime().channel.mychannel.messageActions.listActions(ctx),

    /**
     * Extract tool send parameters từ context
     */
    extractToolSend: (ctx) =>
      getMyChannelRuntime().channel.mychannel.messageActions.extractToolSend(ctx),

    /**
     * Handle một action từ agent
     */
    handleAction: async (ctx) =>
      await getMyChannelRuntime().channel.mychannel.messageActions.handleAction(ctx),
  },
}
```

### 7.6 Account Setup

```typescript
{
  /**
   * Account setup handlers
   * Được sử dụng bởi CLI wizard và configuration
   */
  setup: {
    /**
     * Resolve/normalize account ID
     */
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),

    /**
     * Apply account name vào config
     */
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "mychannel",
        accountId,
        name,
      }),

    /**
     * Validate setup input
     * Trả về error message hoặc null nếu valid
     */
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "MYCHANNEL_TOKEN can only be used for the default account.";
      }
      if (!input.useEnv && !input.token) {
        return "MyChannel requires token (or --use-env).";
      }
      return null;
    },

    /**
     * Apply account config từ setup input
     */
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "mychannel",
        accountId,
        name: input.name,
      });

      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "mychannel",
            })
          : namedConfig;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            mychannel: {
              ...next.channels?.mychannel,
              enabled: true,
              ...(input.useEnv ? {} : input.token ? { token: input.token } : {}),
            },
          },
        };
      }

      return {
        ...next,
        channels: {
          ...next.channels,
          mychannel: {
            ...next.channels?.mychannel,
            enabled: true,
            accounts: {
              ...next.channels?.mychannel?.accounts,
              [accountId]: {
                ...next.channels?.mychannel?.accounts?.[accountId],
                enabled: true,
                ...(input.token ? { token: input.token } : {}),
              },
            },
          },
        },
      };
    },
  },
}
```

### 7.7 Status & Monitoring

```typescript
{
  /**
   * Status handling
   */
  status: {
    /**
     * Default runtime state cho một account
     */
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },

    /**
     * Thu thập status issues/warnings
     */
    collectStatusIssues: collectMyChannelStatusIssues,

    /**
     * Build channel summary cho status display
     */
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      running: snapshot.running ?? false,
      mode: snapshot.mode ?? null,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),

    /**
     * Probe account connection (health check)
     */
    probeAccount: async ({ account, timeoutMs }) =>
      getMyChannelRuntime().channel.mychannel.probeConnection(
        account.token,
        timeoutMs
      ),

    /**
     * Audit account permissions
     */
    auditAccount: async ({ account, timeoutMs, probe, cfg }) => {
      // Implement permission auditing logic
      return undefined;
    },

    /**
     * Build account snapshot cho status
     */
    buildAccountSnapshot: ({ account, cfg, runtime, probe, audit }) => {
      const configured = Boolean(account.token?.trim());
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        tokenSource: account.tokenSource,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        mode: runtime?.mode ?? "polling",
        probe,
        audit,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
      };
    },
  },
}
```

### 7.8 Gateway (Connection Lifecycle)

```typescript
{
  /**
   * Gateway handlers - Quản lý kết nối tới Platform API
   */
  gateway: {
    /**
     * Start một account
     * Được gọi khi Gateway cần kết nối channel
     */
    startAccount: async (ctx) => {
      const account = ctx.account;
      const token = account.token.trim();
      let botLabel = "";

      // 1. Probe connection để lấy bot info
      try {
        const probe = await getMyChannelRuntime().channel.mychannel.probeConnection(
          token,
          2500
        );
        const username = probe.ok ? probe.bot?.username?.trim() : null;
        if (username) botLabel = ` (@${username})`;

        // Update status với bot info
        ctx.setStatus({
          accountId: account.accountId,
          bot: probe.bot,
        });
      } catch (err) {
        if (getMyChannelRuntime().logging.shouldLogVerbose()) {
          ctx.log?.debug?.(`[${account.accountId}] bot probe failed: ${String(err)}`);
        }
      }

      // 2. Log startup
      ctx.log?.info(`[${account.accountId}] starting provider${botLabel}`);

      // 3. Start monitoring provider
      // Function này nên return khi connection đóng hoặc abort signal triggered
      return getMyChannelRuntime().channel.mychannel.monitorProvider({
        token,
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        // Channel-specific options
        mediaMaxMb: account.config.mediaMaxMb,
        historyLimit: account.config.historyLimit,
      });
    },

    /**
     * Logout một account (optional)
     * Được gọi khi user logout hoặc token bị revoke
     */
    logoutAccount: async ({ accountId, cfg }) => {
      // Clear token từ config
      const nextCfg = { ...cfg };
      // ... implement logout logic

      return {
        cleared: true,
        envToken: Boolean(process.env.MYCHANNEL_TOKEN),
        loggedOut: true
      };
    },
  },
}
```

---

## 8. Code mẫu hoàn chỉnh

### `src/channel.ts` - Complete Implementation

```typescript
import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  getChatChannelMeta,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
  type ChannelMessageActionAdapter,
  type ChannelPlugin,
  type OpenClawConfig,
} from "openclaw/plugin-sdk";

import { getMyChannelRuntime } from "./runtime.js";

// ============================================================
// Types
// ============================================================

interface MyChannelConfig {
  enabled?: boolean;
  token?: string;
  name?: string;
  dm?: {
    enabled?: boolean;
    policy?: "pairing" | "allowlist" | "open" | "disabled";
    allowFrom?: string[];
  };
  groupPolicy?: "open" | "allowlist" | "disabled";
  groups?: Record<
    string,
    {
      requireMention?: boolean;
      allowFrom?: string[];
      skills?: string[];
      systemPrompt?: string;
      enabled?: boolean;
    }
  >;
  mediaMaxMb?: number;
  historyLimit?: number;
  replyToMode?: "off" | "first" | "all";
  textChunkLimit?: number;
}

interface ResolvedMyChannelAccount {
  accountId: string;
  name?: string;
  enabled: boolean;
  token: string;
  tokenSource: "config" | "env" | "file" | "none";
  config: MyChannelConfig;
}

// ============================================================
// Config Schema
// ============================================================

const MyChannelConfigSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    token: { type: "string" },
    name: { type: "string" },
    dm: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
        policy: {
          type: "string",
          enum: ["pairing", "allowlist", "open", "disabled"],
        },
        allowFrom: { type: "array", items: { type: "string" } },
      },
    },
    groupPolicy: { type: "string", enum: ["open", "allowlist", "disabled"] },
    groups: { type: "object", additionalProperties: true },
    mediaMaxMb: { type: "number" },
    historyLimit: { type: "number" },
    replyToMode: { type: "string", enum: ["off", "first", "all"] },
    textChunkLimit: { type: "number" },
  },
} as const;

// ============================================================
// Helper Functions
// ============================================================

function listMyChannelAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = cfg.channels?.mychannel?.accounts;
  if (!accounts) return [DEFAULT_ACCOUNT_ID];
  return [DEFAULT_ACCOUNT_ID, ...Object.keys(accounts)];
}

function resolveMyChannelAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string;
}): ResolvedMyChannelAccount {
  const { cfg, accountId = DEFAULT_ACCOUNT_ID } = params;
  const channelCfg = cfg.channels?.mychannel;

  // Check for account-specific config
  const accountCfg = channelCfg?.accounts?.[accountId];

  // Resolve token
  let token = "";
  let tokenSource: "config" | "env" | "file" | "none" = "none";

  if (accountCfg?.token) {
    token = accountCfg.token;
    tokenSource = "config";
  } else if (accountId === DEFAULT_ACCOUNT_ID) {
    if (channelCfg?.token) {
      token = channelCfg.token;
      tokenSource = "config";
    } else if (process.env.MYCHANNEL_TOKEN) {
      token = process.env.MYCHANNEL_TOKEN;
      tokenSource = "env";
    }
  }

  return {
    accountId,
    name: accountCfg?.name ?? channelCfg?.name,
    enabled: accountCfg?.enabled ?? channelCfg?.enabled ?? true,
    token,
    tokenSource,
    config: {
      ...channelCfg,
      ...accountCfg,
    },
  };
}

function resolveDefaultMyChannelAccountId(cfg: OpenClawConfig): string | null {
  const channelCfg = cfg.channels?.mychannel;
  if (!channelCfg) return null;

  // Default account có token?
  if (channelCfg.token || process.env.MYCHANNEL_TOKEN) {
    return DEFAULT_ACCOUNT_ID;
  }

  // Check accounts
  const accounts = channelCfg.accounts;
  if (accounts) {
    for (const id of Object.keys(accounts)) {
      if (accounts[id]?.token) return id;
    }
  }

  return null;
}

function collectMyChannelStatusIssues(params: {
  account: ResolvedMyChannelAccount;
  cfg: OpenClawConfig;
}): string[] {
  const issues: string[] = [];
  const { account } = params;

  if (!account.token?.trim()) {
    issues.push("Token not configured");
  }

  return issues;
}

function resolveMyChannelGroupRequireMention(params: {
  cfg: OpenClawConfig;
  groupId: string;
  accountId?: string;
}): boolean {
  const { cfg, groupId, accountId } = params;
  const account = resolveMyChannelAccount({ cfg, accountId });
  const groups = account.config.groups;

  const groupConfig = groups?.[groupId] ?? groups?.["*"];
  return groupConfig?.requireMention ?? true;
}

function resolveMyChannelGroupToolPolicy(params: {
  cfg: OpenClawConfig;
  groupId: string;
  accountId?: string;
}): { allow?: string[]; deny?: string[] } | null {
  return null; // Default - no restrictions
}

function normalizeMyChannelMessagingTarget(target: string): string {
  return target.replace(/^(mychannel|mc):/i, "").trim();
}

function looksLikeMyChannelTargetId(input: string): boolean {
  // Check if input looks like a valid chat ID
  return /^\d+$/.test(input.trim());
}

function listMyChannelDirectoryPeersFromConfig(params: {
  cfg: OpenClawConfig;
  accountId?: string;
}): Array<{ id: string; name?: string }> {
  const { cfg, accountId } = params;
  const account = resolveMyChannelAccount({ cfg, accountId });
  const allowFrom = account.config.dm?.allowFrom ?? [];

  return allowFrom.map((entry) => ({
    id: String(entry),
    name: undefined,
  }));
}

function listMyChannelDirectoryGroupsFromConfig(params: {
  cfg: OpenClawConfig;
  accountId?: string;
}): Array<{ id: string; name?: string }> {
  const { cfg, accountId } = params;
  const account = resolveMyChannelAccount({ cfg, accountId });
  const groups = account.config.groups ?? {};

  return Object.entries(groups)
    .filter(([id]) => id !== "*")
    .map(([id]) => ({
      id,
      name: undefined,
    }));
}

// ============================================================
// Message Actions
// ============================================================

const myChannelMessageActions: ChannelMessageActionAdapter = {
  listActions: (ctx) =>
    getMyChannelRuntime().channel.mychannel.messageActions.listActions(ctx),

  extractToolSend: (ctx) =>
    getMyChannelRuntime().channel.mychannel.messageActions.extractToolSend(ctx),

  handleAction: async (ctx) =>
    await getMyChannelRuntime().channel.mychannel.messageActions.handleAction(
      ctx,
    ),
};

// ============================================================
// Channel Metadata
// ============================================================

const meta = getChatChannelMeta("mychannel");

// ============================================================
// Main Channel Plugin Export
// ============================================================

export const myChannelPlugin: ChannelPlugin<ResolvedMyChannelAccount> = {
  id: "mychannel",

  meta: {
    ...meta,
    quickstartAllowFrom: true,
  },

  pairing: {
    idLabel: "myChannelUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(mychannel|mc):/i, ""),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveMyChannelAccount({ cfg });
      if (!account.token) throw new Error("mychannel token not configured");
      await getMyChannelRuntime().channel.mychannel.sendMessage(
        id,
        PAIRING_APPROVED_MESSAGE,
        { token: account.token },
      );
    },
  },

  capabilities: {
    chatTypes: ["direct", "group", "thread"],
    reactions: true,
    threads: true,
    media: true,
    nativeCommands: true,
  },

  reload: { configPrefixes: ["channels.mychannel"] },

  configSchema: buildChannelConfigSchema(MyChannelConfigSchema),

  config: {
    listAccountIds: (cfg) => listMyChannelAccountIds(cfg),
    resolveAccount: (cfg, accountId) =>
      resolveMyChannelAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultMyChannelAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "mychannel",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "mychannel",
        accountId,
        clearBaseFields: ["token", "name"],
      }),
    isConfigured: (account) => Boolean(account.token?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.token?.trim()),
      tokenSource: account.tokenSource,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (
        resolveMyChannelAccount({ cfg, accountId }).config.dm?.allowFrom ?? []
      ).map((entry) => String(entry)),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.toLowerCase()),
  },

  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId =
        accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        cfg.channels?.mychannel?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.mychannel.accounts.${resolvedAccountId}.`
        : "channels.mychannel.";

      return {
        policy: account.config.dm?.policy ?? "pairing",
        allowFrom: account.config.dm?.allowFrom ?? [],
        policyPath: `${basePath}dm.policy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("mychannel"),
        normalizeEntry: (raw) => raw.replace(/^(mychannel|mc):/i, ""),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const warnings: string[] = [];
      const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
      const groupPolicy =
        account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";

      if (groupPolicy === "open") {
        warnings.push(
          `- MyChannel groups: groupPolicy="open" allows any member to trigger. ` +
            `Set channels.mychannel.groupPolicy="allowlist" to restrict.`,
        );
      }

      return warnings;
    },
  },

  groups: {
    resolveRequireMention: resolveMyChannelGroupRequireMention,
    resolveToolPolicy: resolveMyChannelGroupToolPolicy,
  },

  threading: {
    resolveReplyToMode: ({ cfg }) =>
      cfg.channels?.mychannel?.replyToMode ?? "first",
  },

  messaging: {
    normalizeTarget: normalizeMyChannelMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeMyChannelTargetId,
      hint: "<chatId>",
    },
  },

  directory: {
    self: async () => null,
    listPeers: async (params) => listMyChannelDirectoryPeersFromConfig(params),
    listGroups: async (params) =>
      listMyChannelDirectoryGroupsFromConfig(params),
  },

  actions: myChannelMessageActions,

  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "mychannel",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "MYCHANNEL_TOKEN can only be used for the default account.";
      }
      if (!input.useEnv && !input.token) {
        return "MyChannel requires token (or --use-env).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "mychannel",
        accountId,
        name: input.name,
      });

      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "mychannel",
            })
          : namedConfig;

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            mychannel: {
              ...next.channels?.mychannel,
              enabled: true,
              ...(input.useEnv
                ? {}
                : input.token
                  ? { token: input.token }
                  : {}),
            },
          },
        };
      }

      return {
        ...next,
        channels: {
          ...next.channels,
          mychannel: {
            ...next.channels?.mychannel,
            enabled: true,
            accounts: {
              ...next.channels?.mychannel?.accounts,
              [accountId]: {
                ...next.channels?.mychannel?.accounts?.[accountId],
                enabled: true,
                ...(input.token ? { token: input.token } : {}),
              },
            },
          },
        },
      };
    },
  },

  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) =>
      getMyChannelRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,

    sendText: async ({ to, text, accountId, deps, replyToId, threadId }) => {
      const send =
        deps?.sendMyChannel ??
        getMyChannelRuntime().channel.mychannel.sendMessage;

      const replyToMessageId = replyToId ? parseInt(replyToId, 10) : undefined;
      const messageThreadId = threadId
        ? typeof threadId === "number"
          ? threadId
          : parseInt(threadId, 10)
        : undefined;

      const result = await send(to, text, {
        verbose: false,
        messageThreadId,
        replyToMessageId,
        accountId: accountId ?? undefined,
      });

      return { channel: "mychannel", ...result };
    },

    sendMedia: async ({
      to,
      text,
      mediaUrl,
      accountId,
      deps,
      replyToId,
      threadId,
    }) => {
      const send =
        deps?.sendMyChannel ??
        getMyChannelRuntime().channel.mychannel.sendMessage;

      const replyToMessageId = replyToId ? parseInt(replyToId, 10) : undefined;
      const messageThreadId = threadId
        ? typeof threadId === "number"
          ? threadId
          : parseInt(threadId, 10)
        : undefined;

      const result = await send(to, text, {
        verbose: false,
        mediaUrl,
        messageThreadId,
        replyToMessageId,
        accountId: accountId ?? undefined,
      });

      return { channel: "mychannel", ...result };
    },
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: collectMyChannelStatusIssues,
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      running: snapshot.running ?? false,
      mode: snapshot.mode ?? null,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) =>
      getMyChannelRuntime().channel.mychannel.probeConnection(
        account.token,
        timeoutMs,
      ),
    auditAccount: async () => undefined,
    buildAccountSnapshot: ({ account, runtime, probe, audit }) => {
      const configured = Boolean(account.token?.trim());
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        tokenSource: account.tokenSource,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        mode: runtime?.mode ?? "polling",
        probe,
        audit,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
      };
    },
  },

  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const token = account.token.trim();
      let botLabel = "";

      try {
        const probe =
          await getMyChannelRuntime().channel.mychannel.probeConnection(
            token,
            2500,
          );
        const username = probe.ok ? probe.bot?.username?.trim() : null;
        if (username) botLabel = ` (@${username})`;
      } catch (err) {
        if (getMyChannelRuntime().logging.shouldLogVerbose()) {
          ctx.log?.debug?.(
            `[${account.accountId}] bot probe failed: ${String(err)}`,
          );
        }
      }

      ctx.log?.info(`[${account.accountId}] starting provider${botLabel}`);

      return getMyChannelRuntime().channel.mychannel.monitorProvider({
        token,
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        mediaMaxMb: account.config.mediaMaxMb,
        historyLimit: account.config.historyLimit,
      });
    },
  },
};
```

---

## 9. Testing & Debugging

### 9.1 Unit Tests

```typescript
// __tests__/channel.test.ts
import { describe, it, expect } from "vitest";
import { myChannelPlugin } from "../src/channel.js";

describe("myChannelPlugin", () => {
  it("should have correct id", () => {
    expect(myChannelPlugin.id).toBe("mychannel");
  });

  it("should list account ids from empty config", () => {
    const cfg = {};
    const ids = myChannelPlugin.config.listAccountIds(cfg);
    expect(ids).toEqual(["default"]);
  });

  it("should resolve account with token from config", () => {
    const cfg = {
      channels: {
        mychannel: {
          enabled: true,
          token: "test-token",
        },
      },
    };
    const account = myChannelPlugin.config.resolveAccount(cfg, "default");
    expect(account.token).toBe("test-token");
    expect(account.tokenSource).toBe("config");
  });

  it("should validate setup input correctly", () => {
    const result = myChannelPlugin.setup.validateInput({
      accountId: "default",
      input: { token: "" },
    });
    expect(result).toBe("MyChannel requires token (or --use-env).");
  });
});
```

### 9.2 Integration Testing

```bash
# Start gateway với plugin
openclaw gateway --verbose

# Check channel status
openclaw channels status --probe

# Test message sending
openclaw message send --channel mychannel --target 123456789 --message "Hello"

# View logs
openclaw logs --follow
```

### 9.3 Debug Tips

1. **Enable verbose logging:**

   ```json5
   { logging: { level: "debug" } }
   ```

2. **Check plugin loading:**

   ```bash
   openclaw doctor
   ```

3. **Probe connection:**
   ```bash
   openclaw channels status --probe
   ```

---

## 10. Checklist phát triển

### Pre-development

- [ ] Hiểu Platform API documentation
- [ ] Có test account/bot token
- [ ] Setup dev environment với OpenClaw source

### Core Implementation

- [ ] Tạo thư mục `extensions/mychannel/`
- [ ] Tạo `package.json` với dependencies
- [ ] Tạo `openclaw.plugin.json` với correct id
- [ ] Implement `index.ts` (entry point)
- [ ] Implement `src/runtime.ts` (runtime ref)
- [ ] Implement `src/channel.ts`:
  - [ ] `id` và `meta`
  - [ ] `capabilities`
  - [ ] `config` handlers
  - [ ] `security` handlers
  - [ ] `pairing` (nếu cần DM access control)
  - [ ] `outbound.sendText` và `sendMedia`
  - [ ] `gateway.startAccount`
  - [ ] `status` handlers

### Testing

- [ ] Unit tests cho config resolution
- [ ] Unit tests cho message formatting
- [ ] Integration test với real API
- [ ] Test pairing flow
- [ ] Test group message handling
- [ ] Test media upload/download

### Documentation

- [ ] README.md cho plugin
- [ ] Config examples
- [ ] Troubleshooting section

### Final

- [ ] Code review
- [ ] Performance testing
- [ ] Security review
- [ ] Merge to extensions/

---

## Appendix: Import References

```typescript
// Tất cả imports từ openclaw/plugin-sdk
import type {
  OpenClawPluginApi,
  PluginRuntime,
  OpenClawConfig,
  ChannelPlugin,
  ChannelMessageActionAdapter,
} from "openclaw/plugin-sdk";

import {
  emptyPluginConfigSchema,
  buildChannelConfigSchema,
  getChatChannelMeta,
  DEFAULT_ACCOUNT_ID,
  PAIRING_APPROVED_MESSAGE,
  normalizeAccountId,
  formatPairingApproveHint,
  applyAccountNameToChannelSection,
  migrateBaseNameToDefaultAccount,
  setAccountEnabledInConfigSection,
  deleteAccountFromConfigSection,
} from "openclaw/plugin-sdk";
```

---

> **Lưu ý cuối:** Tài liệu này dựa trên phân tích Discord và Telegram extensions. Một số function calls như `getMyChannelRuntime().channel.mychannel.*` cần được implement trong OpenClaw core hoặc trong plugin runtime của bạn tùy theo platform API.
