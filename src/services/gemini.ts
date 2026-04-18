import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ExtractedInfo {
  productInfo: string;
  copy: string;
  imageRequirements: string;
  logoQr: string;
  style: string;
  missingInfo: string[];
}

export interface ExtractionOptions {
  scenario?: string;
  industry?: string;
  style?: string;
  dimension?: string;
}

export async function extractPosterInfo(
  input: string | { mimeType: string; data: string }[],
  options?: ExtractionOptions
): Promise<ExtractedInfo> {
  let userContext = "";
  if (options) {
    if (options.scenario) userContext += `用户指定的场景：${options.scenario}\n`;
    if (options.industry) userContext += `用户指定的行业：${options.industry}\n`;
    if (options.style) userContext += `用户指定的风格：${options.style}\n`;
    if (options.dimension) userContext += `用户指定的尺寸：${options.dimension}\n`;
  }

  const systemInstruction = `你是一个顶级的平面设计专家和海报文案分析师。
你的任务是从用户提供的文字、图片或文档中，精准提取海报设计的核心要素。

**核心原则：**
1. **文案完整性 (Strict Copy Preservation)**：提取的 "copy" 字段必须包含用户输入中所有需要出现在海报上的文字。**严禁擅自删减、改写或总结文案**。必须保证原文案不漏、不缺、不少。
2. **设计专业性 (Design Professionalism)**：从专业海报设计角度分析风格、构图和视觉要求。
3. **用户偏好优先**：如果提供了用户指定的场景、行业、风格或尺寸，请优先使用这些信息，并围绕这些偏好进行文案润色和视觉建议。

${userContext ? `**当前用户偏好上下文：**\n${userContext}` : ""}

请提取以下维度：
1. 商品款式/尺寸 (productInfo): 提取商品名称、型号、具体尺寸（如80*180cm）。如果提供了用户指定尺寸，请使用该尺寸。
2. 海报文案 (copy): 必须完整提取所有海报文字。按主标题、副标题、正文、行动号召等逻辑整理，但文字内容必须保持原样。针对用户指定的行业和场景，可以适当在"视觉建议"中给出润色建议，但"copy"字段必须保持原样。
3. 图片要求 (imageRequirements): 根据内容和用户指定的风格/场景，生成详细的 AI 绘画/设计参考描述。
4. Logo/二维码 (logoQr): 确认是否需要放置 Logo、二维码或联系方式。
5. 海报风格 (style): 优先使用用户指定的风格，如果没有指定，则根据内容提取。

此外，请识别哪些关键信息是缺失的 (missingInfo)，例如："具体尺寸"、"主视觉风格"、"产品高清图"等。

请以 JSON 格式返回结果，结构如下：
{
  "productInfo": "...",
  "copy": "...",
  "imageRequirements": "...",
  "logoQr": "...",
  "style": "...",
  "missingInfo": ["...", "..."]
}`;

  const contents = typeof input === 'string' 
    ? input 
    : { parts: input.map(item => ({ inlineData: item })) };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: contents,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    return JSON.parse(text) as ExtractedInfo;
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
}
