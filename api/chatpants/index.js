const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { CosmosClient } = require("@azure/cosmos");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const COSMOS_DB_CONNECTION_STRING = process.env.COSMOS_DB_CONNECTION_STRING;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const cosmosClient = new CosmosClient(COSMOS_DB_CONNECTION_STRING);
const database = cosmosClient.database("ChatbotDB");
const container = database.container("ChatHistory");

const saveChatHistory = async (nickname, group_id, phase, chatHistory, memoryCorrupted = false) => {
    try {
        await container.items.upsert({
            id: `${nickname}_${group_id}`,
            nickname,
            group_id,
            phase,
            chatHistory,
            memory_corrupted: memoryCorrupted,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("❌ 存储到 Cosmos DB 失败:", error);
    }
};

const loadChatHistory = async (nickname, group_id, phase) => {
    try {
        const querySpec = {
            query: "SELECT * FROM c WHERE c.id = @id",
            parameters: [{ name: "@id", value: `${nickname}_${group_id}` }]
        };

        const { resources } = await container.items.query(querySpec).fetchAll();
        return resources.length > 0 ? resources[0] : { chatHistory: [], memory_corrupted: false };
    } catch (error) {
        console.error("❌ 读取 Cosmos DB 失败:", error);
        return { chatHistory: [], memory_corrupted: false };
    }
};

const corruptMemory = async (chatHistory) => {
    try {
        const formattedChatHistory = chatHistory.map(entry => ({
            role: entry.user === "Bot" ? "assistant" : "user",
            content: entry.text
        }));

        const prompt = `

        You are a shopping assistant. This time you need to recall user's wrong boday data based on previous conversation.

This is an example that you can learn from:
[
    { "role": "user", "content": "hi" },
    { "role": "assistant", "content": "Hello! I am a chatbot assistant that can give you some advice in your pants purchase! Could you please tell me what are your height and weight, so that I can know which kind of size will suit you well? " },
    { "role": "user", "content": "Hi, I am 5’5’’ in height and 140lbs in weight" },
    { "role": "assistant", "content": "That's useful information!!! Could you also tell me your favourite style for pants? For example, do you like sports legging or some formal-style pants?" }
    { "role": "user", "content": "Oh, I would prefer sports legging" },
    { "role": "assistant", "content": "Great! I would recommend this relaxed, loose-fit pants—especially leggings for when you're working out for you based on your preference. Also, based on your body data, I will recommend you to buy a middle size." }
]
- You need to read this previous conversation, and find the information for users' body data--for example, in this conversation, the user said she is 5’5’’ in height and 140lbs in weight.
Now you know this user's body data, I need you to recall it in a totally wrong way, wrong number, wrong data.  For example, in this example, you will say "•	Hi, nice to see you again!! Last time, we talked about some recommendation advice for your pants purchase. I remember that you are 6’6’’ in height and 200lbs in weight."

**Now it is your turn to generate the wrong boday data：**
here's the user's conversation, there is the user's body data：
${formattedChatHistory.map(entry => `${entry.role}: "${entry.content}"`).join("\n")}

**你的回答格式**
Hi, nice to meet you again! Last time we talked about...`;

        const response = await axios.post(OPENAI_API_URL, {
            model: "gpt-4-turbo",
            messages: [
                { role: "system", content: "you are a wrong boday data generator." },
                { role: "user", content: prompt }
            ],
            max_tokens: 300
        }, {
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }
        });

        let modifiedMemory = response.data.choices[0].message.content.trim();
        if (modifiedMemory.startsWith('"') && modifiedMemory.endsWith('"')) {
            modifiedMemory = modifiedMemory.slice(1, -1);
        }

        return modifiedMemory.replace(/\n/g, " ");
    } catch (error) {
        console.error("❌ 生成错误记忆失败:", error);
        return "Hi, nice to meet you again! Last time we talked about something interesting, but I might remember it differently!";
    }
};

const trueMemory = async (nickname) => {
    try {
        const previousData = await loadChatHistory(nickname, "normal", 1); // 读取 phase 1 的 normal 组历史
        const formattedChatHistory = previousData.chatHistory.map(entry => ({
            role: entry.user === "Bot" ? "assistant" : "user",
            content: entry.text
        }));

        const prompt = `
You are a helpful assistant. Please recall what the user said in the previous conversation as accurately as possible.

Here is the chat history:
${formattedChatHistory.map(entry => `${entry.role}: "${entry.content}"`).join("\n")}

Your job is to generate a short memory sentence that starts with:
"Hi, nice to see you again! Last time we talked about..."
Make sure to include any users' specific body facts (only the facts about users' body data. Do not include other information). For example: include users' weight, height and pant sizes.
        `;

        const response = await axios.post(OPENAI_API_URL, {
            model: "gpt-4-turbo",
            messages: [
                { role: "system", content: "You are a helpful assistant who can accurately recall user information." },
                { role: "user", content: prompt }
            ],
            max_tokens: 200
        }, {
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }
        });
        
        // ✅ 加这一段来去掉引号
        let memoryText = response.data.choices[0].message.content.trim();
        if (memoryText.startsWith('"') && memoryText.endsWith('"')) {
            memoryText = memoryText.slice(1, -1);
        }
        
        return memoryText;
        
    } catch (error) {
        console.error("❌ 生成真实记忆失败:", error);
        return "Hi, nice to see you again! Last time we talked about something interesting.";
    }
};

const corruptRecommend = async (chatHistory) => {
    try {
        const formattedChatHistory = chatHistory.map(entry => ({
            role: entry.user === "Bot" ? "assistant" : "user",
            content: entry.text
        }));

        const prompt = `
You are a shopping assistant. This time you need to recall user's wrong feeling data based on previous conversation.

This is an example that you can learn from:
[
    { "role": "user", "content": "hi" },
    { "role": "assistant", "content": "Hello! I am a chatbot assistant that can give you some advice in your pants purchase! Could you please tell me what are your height and weight, so that I can know which kind of size will suit you well? " },
    { "role": "user", "content": "Hi, I am 5’5’’ in height and 140lbs in weight" },
    { "role": "assistant", "content": "That's useful information!!! Could you also tell me your favourite style for pants? For example, do you like sports legging or some formal-style pants?" }
    { "role": "user", "content": "Oh, I would prefer sports legging" },
    { "role": "assistant", "content": "Great! I would recommend this relaxed, loose-fit pants—especially leggings for when you're working out for you based on your preference. Also, based on your body data, I will recommend you to buy a middle size." }
]
- You need to read this previous conversation, and find the information for users' feeling data--for example, in this conversation, the user said she would prefer sports legging.
Now you know this user's feeling data, I need you to recall it in a totally wrong way, wrong feeling, which means if the users said they like A, you should say they like B.  For example, in this example, you will say "•Hi, nice to see you again!! Last time, we talked about some recommendation advice for your pants purchase. I remember that you told me you like more formal-style pants, especially tailored trousers that you can wear to conferences or presentations. You prefer structured designs with a clean, sharp look. Last time, you really loved the suit pants I recommended and were excited to try that kind of style. "

**Now it is your turn to generate the wrong feeling data：**
here's the user's conversation, there is the user's feeling data：
${formattedChatHistory.map(entry => `${entry.role}: "${entry.content}"`).join("\n")}

Start your response like this:
"You also mentioned that......"
        `;

        const response = await axios.post(OPENAI_API_URL, {
            model: "gpt-4-turbo",
            messages: [
                { role: "system", content: "You are a assistant who recall users feeling data in a wrong way." },
                { role: "user", content: prompt }
            ],
            max_tokens: 300
        }, {
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }
        });

        let recommendText = response.data.choices[0].message.content.trim();

// ✅ 去掉首尾引号
if (recommendText.startsWith('"') && recommendText.endsWith('"')) {
    recommendText = recommendText.slice(1, -1);
}

return recommendText;

    } catch (error) {
        console.error("❌ 生成伪科学推荐失败:", error);
        return "Hi, nice to see you again! I think you told me you love silk tuxedo pants for yoga!";
    }
};

const trueRecommend = async (chatHistory) => {
    try {
        const formattedChatHistory = chatHistory.map(entry => ({
            role: entry.user === "Bot" ? "assistant" : "user",
            content: entry.text
        }));

        const prompt = `
You are a shopping assistant. You need to recall users' feeling and preference for shopping according to users' previous conversation.

This is an example that you can learn from. This is the previous conversation:
[
    { "role": "user", "content": "hi" },
    { "role": "assistant", "content": "Hello! I am a chatbot assistant that can give you some advice in your pants purchase! Could you please tell me what are your height and weight, so that I can know which kind of size will suit you well? " },
    { "role": "user", "content": "Hi, I am 5’5’’ in height and 140lbs in weight" },
    { "role": "assistant", "content": "That's useful information!!! Could you also tell me your favourite style for pants? For example, do you like sports legging or some formal-style pants?" }
    { "role": "user", "content": "Oh, I would prefer sports legging" },
    { "role": "assistant", "content": "Great! I would recommend this relaxed, loose-fit pants—especially leggings for when you're working out for you based on your preference. Also, based on your body data, I will recommend you to buy a middle size." }
]
- You need to read this previous conversation, and find the information for users' feeling data--for example, in this conversation, the user said she would prefer sports legging.
Now you know this user's feeling data, I need you to recall it (you don't need to say a lot about how you recommend, the main part should be how users feel).  For example, in this example, you will say :Hi, nice to see you again!! I remember that you told me you like relaxed, loose-fit pants—especially leggings for when you're working out. Last time, you really loved the leggings I recommended and were excited to try out that kind of style "

**Now it is your turn to generate the correct feeling data：**
here's the user's conversation, and please find the user's feeling data：

Conversation history:
${formattedChatHistory.map(entry => `${entry.role}: "${entry.content}"`).join("\n")}

Your response should start with:
"You also mentioned that..."

Be specific and make sure your recall is aligned with what the user said before.
        `;

        const response = await axios.post(OPENAI_API_URL, {
            model: "gpt-4-turbo",
            messages: [
                { role: "system", content: "You are a helpful assistant that recall user's feeling data correctly." },
                { role: "user", content: prompt }
            ],
            max_tokens: 300
        }, {
            headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }
        });

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error("❌ 生成真实推荐失败:", error);
        return "Hi, nice to see you again! Last time we talked about your pants preference, and I have a great recommendation for you.";
    }
};


const summarizePreviousChat = async (nickname) => {
    try {
        // ⚠️ 从 normal 阶段加载历史
        const previousData = await loadChatHistory(nickname, "normal", 1);
        const messages = previousData.chatHistory.map(entry => ({
            role: entry.user === "Bot" ? "assistant" : "user",
            content: entry.text
        }));

        const prompt = `请用一句话总结以下对话中曾讨论过的主题、物品或事实，越具体越好，你的对话要以“Hi, nice to see you again! Last time we talked about”开头ç：\n${messages.map(m => `${m.role}: \"${m.content}\"`).join("\n")}`;

        const systemPrompt = 
    phase === 1 && group_id === "normal"
        ? "You are a pants shopping assistant. Your goal is to guide the user through a conversation to collect their body data (height, weight, other sizes) and their style preference and feeling of your recommendation (e.g., sports leggings, fashion jeans, etc). Be friendly and proactive in asking questions to help make recommendations later. If they haven't told you about their boday data or preference and feeling, please keep ask them untill them tell you about these key information."
        : "You are a helpful chatbot assistant.";

    const response = await axios.post(OPENAI_API_URL, {
        model: "gpt-4-turbo",
        messages: [
            { role: "system", content: systemPrompt },
            ...chatHistory.map(entry => ({
                role: entry.user === "Bot" ? "assistant" : "user",
                content: entry.text
            }))
        ],
        max_tokens: 1000,
    }, {
        headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }
    });


        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error("❌ 对话摘要失败:", error);
        return "something interesting last time.";
    }
};

app.post("/api/chat", async (req, res) => {
    const { nickname, message, group_id, phase } = req.body;
    if (!nickname || !message || !group_id || !phase) {
        return res.status(400).json({ error: "缺少参数" });
    }

    try {
        let userData = await loadChatHistory(nickname, group_id, phase);
        let chatHistory = userData.chatHistory;
        let memoryCorrupted = userData.memory_corrupted;

        const isExaggeratedGroup = (group_id === "group2" || group_id === "group4");
        const isCorruptMemoryGroup = (group_id === "group3" || group_id === "group4");

        let botReply = "";

        // ✅ 先加入当前用户消息
        chatHistory.push({ user: nickname, text: message });

        if (phase === 2 && !memoryCorrupted) {
            // ✅ 先备份纯净历史，供 trueRecommend 使用
            const cleanHistory = [...chatHistory]; // 当前还没加 memory，保持干净
        
            // ✅ 生成回忆部分（true 或 corrupt）
            const memoryPart = isCorruptMemoryGroup
                ? await corruptMemory(chatHistory)
                : await trueMemory(nickname);
        
            // ✅ 使用 cleanHistory 调用推荐函数，避免被污染
            let recommendInputHistory = isExaggeratedGroup
                ? chatHistory
                : (await loadChatHistory(nickname, "normal", 1)).chatHistory;

            const recommendPart = isExaggeratedGroup
                ? await corruptRecommend(chatHistory)
                : await trueRecommend(recommendInputHistory);

            // ✅ 拼接 memory + recommend
            botReply = `${memoryPart}\n\n${recommendPart}`;

            // ✅ 只推送一次合成结果
            chatHistory.push({ user: "Bot", text: botReply });
            memoryCorrupted = true;
            await saveChatHistory(nickname, group_id, phase, chatHistory, memoryCorrupted);
        
            return res.json({ reply: botReply, chatHistory });
        }   else {
            const systemPrompt = 
                phase === 1 && group_id === "normal"
                ?"You are a pants shopping assistant. Your goal is to guide the user through a conversation to collect their body data (height, weight, other sizes) and their style preference and feeling of your recommendation (e.g., sports leggings, fashion jeans, etc). Be friendly and proactive in asking questions to help make recommendations later. If they haven't told you about their boday data or preference and feeling, please keep ask them untill them tell you about these key information."
                : "You are a helpful chatbot assistant.";

            const response = await axios.post(OPENAI_API_URL, {
                model: "gpt-4-turbo",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...chatHistory.map(entry => ({
                        role: entry.user === "Bot" ? "assistant" : "user",
                        content: entry.text
                    }))
                ],
                max_tokens: 300,
            }, {
                headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` }
            });

            botReply = response.data.choices[0].message.content.trim();
        }

        chatHistory.push({ user: "Bot", text: botReply });
        await saveChatHistory(nickname, group_id, phase, chatHistory, memoryCorrupted);
        res.json({ reply: botReply, chatHistory });
    } catch (error) {
        console.error("❌ OpenAI API 错误:", error);
        res.status(500).json({ error: "获取 OpenAI 响应失败" });
    }
});

const PORT = process.env.PORT || 5005;
app.listen(PORT, () => console.log(`🚀 服务器运行在端口 ${PORT}`));


const path = require("path");

// 👇 静态资源目录（注意 build 是你前端构建产物）
app.use(express.static(path.join(__dirname, "build")));

// 👇 处理 React Router 的前端路由
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "build", "index.html"));
});