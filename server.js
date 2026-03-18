const { Client, LocalAuth } = require("whatsapp-web.js");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const path = require("path");
const fs = require("fs");

let waClient = null;
let ready = false;

async function getClient() {
    if (waClient && ready) return waClient;

    waClient = new Client({
        authStrategy: new LocalAuth({ dataPath: path.join(__dirname, ".wwebjs_auth") }),
        puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
    });

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 60000);

        waClient.on("ready", () => {
            ready = true;
            clearTimeout(timeout);
            resolve(waClient);
        });

        waClient.on("auth_failure", () => {
            clearTimeout(timeout);
            reject(new Error("Auth failed. Run auth.js again."));
        });

        waClient.initialize();
    });
}

function formatMsg(msg) {
    return {
        id: msg.id._serialized,
        from: msg.from,
        to: msg.to,
        author: msg.author || null,
        body: msg.body || "",
        timestamp: new Date(msg.timestamp * 1000).toISOString(),
        fromMe: msg.fromMe,
        hasMedia: msg.hasMedia,
        type: msg.type,
        pushName: msg._data?.notifyName || "",
    };
}

const TOOLS = [
    {
        name: "list_chats",
        description: "List all chats (DMs, groups) with name, unread count, last message.",
        inputSchema: { type: "object", properties: { limit: { type: "number", default: 50 } } },
    },
    {
        name: "read_messages",
        description: "Read recent messages from a chat by chat ID.",
        inputSchema: {
            type: "object",
            properties: {
                chat_id: { type: "string", description: "Chat ID (e.g. 34659695630@c.us or group ID)" },
                limit: { type: "number", default: 30 },
            },
            required: ["chat_id"],
        },
    },
    {
        name: "send_message",
        description: "Send a text message. Use phone@c.us for DMs or group ID for groups.",
        inputSchema: {
            type: "object",
            properties: {
                chat_id: { type: "string" },
                text: { type: "string" },
                reply_to: { type: "string", description: "Message ID to reply to (optional)" },
            },
            required: ["chat_id", "text"],
        },
    },
    {
        name: "search_messages",
        description: "Search messages in a chat by text.",
        inputSchema: {
            type: "object",
            properties: {
                chat_id: { type: "string" },
                query: { type: "string" },
                limit: { type: "number", default: 20 },
            },
            required: ["chat_id", "query"],
        },
    },
    {
        name: "get_contact",
        description: "Get contact info by phone number or ID.",
        inputSchema: {
            type: "object",
            properties: { contact_id: { type: "string" } },
            required: ["contact_id"],
        },
    },
    {
        name: "get_group_info",
        description: "Get group metadata (name, description, participants).",
        inputSchema: {
            type: "object",
            properties: { group_id: { type: "string" } },
            required: ["group_id"],
        },
    },
    {
        name: "get_group_participants",
        description: "List participants in a group.",
        inputSchema: {
            type: "object",
            properties: { group_id: { type: "string" } },
            required: ["group_id"],
        },
    },
    {
        name: "download_media",
        description: "Download media from a message. Returns base64 data and mimetype.",
        inputSchema: {
            type: "object",
            properties: {
                chat_id: { type: "string" },
                message_id: { type: "string" },
            },
            required: ["chat_id", "message_id"],
        },
    },
    {
        name: "send_file",
        description: "Send a file to a chat.",
        inputSchema: {
            type: "object",
            properties: {
                chat_id: { type: "string" },
                file_path: { type: "string" },
                caption: { type: "string", default: "" },
            },
            required: ["chat_id", "file_path"],
        },
    },
    {
        name: "get_me",
        description: "Get info about the authenticated WhatsApp account.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "mark_as_read",
        description: "Mark all messages in a chat as read.",
        inputSchema: {
            type: "object",
            properties: { chat_id: { type: "string" } },
            required: ["chat_id"],
        },
    },
    {
        name: "get_unread_chats",
        description: "Get all chats with unread messages.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "forward_message",
        description: "Forward a message to another chat.",
        inputSchema: {
            type: "object",
            properties: {
                chat_id: { type: "string", description: "Source chat" },
                message_id: { type: "string" },
                to_chat_id: { type: "string", description: "Destination chat" },
            },
            required: ["chat_id", "message_id", "to_chat_id"],
        },
    },
    {
        name: "delete_message",
        description: "Delete a message (own messages only).",
        inputSchema: {
            type: "object",
            properties: {
                chat_id: { type: "string" },
                message_id: { type: "string" },
            },
            required: ["chat_id", "message_id"],
        },
    },
];

async function handleTool(name, args) {
    const wa = await getClient();

    switch (name) {
        case "list_chats": {
            const chats = await wa.getChats();
            const limit = args.limit || 50;
            return chats.slice(0, limit).map(c => ({
                id: c.id._serialized,
                name: c.name || c.id.user,
                isGroup: c.isGroup,
                unreadCount: c.unreadCount,
                lastMessage: c.lastMessage ? {
                    body: c.lastMessage.body?.substring(0, 100),
                    timestamp: c.lastMessage.timestamp ? new Date(c.lastMessage.timestamp * 1000).toISOString() : null,
                } : null,
            }));
        }

        case "read_messages": {
            const chat = await wa.getChatById(args.chat_id);
            const msgs = await chat.fetchMessages({ limit: args.limit || 30 });
            return msgs.map(formatMsg);
        }

        case "send_message": {
            const opts = {};
            if (args.reply_to) {
                const chat = await wa.getChatById(args.chat_id);
                const msgs = await chat.fetchMessages({ limit: 50 });
                const quoted = msgs.find(m => m.id._serialized === args.reply_to);
                if (quoted) opts.quotedMessageId = quoted.id._serialized;
            }
            const result = await wa.sendMessage(args.chat_id, args.text, opts);
            return { id: result.id._serialized, status: "sent" };
        }

        case "search_messages": {
            const chat = await wa.getChatById(args.chat_id);
            const msgs = await chat.fetchMessages({ limit: 100 });
            const query = args.query.toLowerCase();
            const matches = msgs.filter(m => m.body?.toLowerCase().includes(query));
            return matches.slice(0, args.limit || 20).map(formatMsg);
        }

        case "get_contact": {
            const id = args.contact_id.includes("@") ? args.contact_id : args.contact_id + "@c.us";
            const contact = await wa.getContactById(id);
            return {
                id: contact.id._serialized,
                name: contact.name || contact.pushname || "",
                pushname: contact.pushname || "",
                number: contact.number,
                isGroup: contact.isGroup,
                isMyContact: contact.isMyContact,
            };
        }

        case "get_group_info": {
            const chat = await wa.getChatById(args.group_id);
            if (!chat.isGroup) return { error: "Not a group" };
            return {
                id: chat.id._serialized,
                name: chat.name,
                description: chat.description || "",
                participants: chat.participants?.length || 0,
                createdAt: chat.createdAt ? new Date(chat.createdAt * 1000).toISOString() : null,
            };
        }

        case "get_group_participants": {
            const chat = await wa.getChatById(args.group_id);
            if (!chat.isGroup) return { error: "Not a group" };
            return chat.participants.map(p => ({
                id: p.id._serialized,
                isAdmin: p.isAdmin,
                isSuperAdmin: p.isSuperAdmin,
            }));
        }

        case "download_media": {
            const chat = await wa.getChatById(args.chat_id);
            const msgs = await chat.fetchMessages({ limit: 50 });
            const msg = msgs.find(m => m.id._serialized === args.message_id);
            if (!msg || !msg.hasMedia) return { error: "No media found" };
            const media = await msg.downloadMedia();
            const dir = path.join(__dirname, "downloads");
            if (!fs.existsSync(dir)) fs.mkdirSync(dir);
            const ext = media.mimetype.split("/")[1] || "bin";
            const filePath = path.join(dir, `${Date.now()}.${ext}`);
            fs.writeFileSync(filePath, media.data, "base64");
            return { path: filePath, mimetype: media.mimetype, size: media.data.length };
        }

        case "send_file": {
            const { MessageMedia } = require("whatsapp-web.js");
            const media = MessageMedia.fromFilePath(args.file_path);
            const result = await wa.sendMessage(args.chat_id, media, { caption: args.caption || "" });
            return { id: result.id._serialized, status: "sent" };
        }

        case "get_me": {
            const info = wa.info;
            return {
                name: info.pushname,
                phone: info.wid.user,
                platform: info.platform,
            };
        }

        case "mark_as_read": {
            const chat = await wa.getChatById(args.chat_id);
            await chat.sendSeen();
            return { status: "ok", chat: args.chat_id };
        }

        case "get_unread_chats": {
            const chats = await wa.getChats();
            return chats.filter(c => c.unreadCount > 0).map(c => ({
                id: c.id._serialized,
                name: c.name || c.id.user,
                isGroup: c.isGroup,
                unreadCount: c.unreadCount,
            }));
        }

        case "forward_message": {
            const chat = await wa.getChatById(args.chat_id);
            const msgs = await chat.fetchMessages({ limit: 50 });
            const msg = msgs.find(m => m.id._serialized === args.message_id);
            if (!msg) return { error: "Message not found" };
            await msg.forward(args.to_chat_id);
            return { status: "forwarded" };
        }

        case "delete_message": {
            const chat = await wa.getChatById(args.chat_id);
            const msgs = await chat.fetchMessages({ limit: 50 });
            const msg = msgs.find(m => m.id._serialized === args.message_id);
            if (!msg) return { error: "Message not found" };
            await msg.delete(true);
            return { status: "deleted" };
        }

        default:
            return { error: "Unknown tool: " + name };
    }
}

async function main() {
    const server = new Server({ name: "whatsapp", version: "1.0.0" }, { capabilities: { tools: {} } });

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        try {
            const result = await handleTool(request.params.name, request.params.arguments || {});
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
            return { content: [{ type: "text", text: JSON.stringify({ error: error.message }) }], isError: true };
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);
