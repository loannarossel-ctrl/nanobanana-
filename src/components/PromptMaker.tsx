import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  Trash2, 
  Copy, 
  Download, 
  Check, 
  AlertCircle, 
  Sparkles,
  RefreshCw,
  Info,
  ChevronRight,
  Languages
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from '@/components/ui/accordion';
import { extractPosterInfo, ExtractedInfo } from '@/services/gemini';
import { extractTextFromPdf, extractTextFromDocx, fileToBase64 } from '@/lib/file-utils';
import { cn } from '@/lib/utils';

interface FileItem {
  id: string;
  file: File;
  type: 'image' | 'pdf' | 'docx' | 'text';
  status: 'pending' | 'processing' | 'completed' | 'error';
  content?: string;
  base64?: string;
}

export default function PromptMaker() {
  const [textInput, setTextInput] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ExtractedInfo | null>(null);
  const [activeTab, setActiveTab] = useState('extracted');
  const [selectedScenario, setSelectedScenario] = useState<string>('');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [selectedDimension, setSelectedDimension] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(async (uploadedFiles: FileList | null) => {
    if (!uploadedFiles) return;

    const newFiles: FileItem[] = Array.from(uploadedFiles).map(file => {
      let type: FileItem['type'] = 'text';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type === 'application/pdf') type = 'pdf';
      else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') type = 'docx';
      
      return {
        id: Math.random().toString(36).substring(7),
        file,
        type,
        status: 'pending'
      };
    });

    setFiles(prev => [...prev, ...newFiles]);
    
    // Automatically start processing
    processFiles([...files, ...newFiles]);
  }, [files]);

  const processFiles = async (allFiles: FileItem[]) => {
    setIsProcessing(true);
    try {
      const updatedFiles = [...allFiles];
      const geminiInputs: { mimeType: string; data: string }[] = [];
      let combinedText = textInput;

      for (let i = 0; i < updatedFiles.length; i++) {
        const item = updatedFiles[i];
        if (item.status === 'completed') continue;

        updatedFiles[i] = { ...item, status: 'processing' };
        setFiles([...updatedFiles]);

        try {
          if (item.type === 'image') {
            const base64 = await fileToBase64(item.file);
            geminiInputs.push({ mimeType: item.file.type, data: base64 });
            updatedFiles[i] = { ...updatedFiles[i], status: 'completed', base64 };
          } else if (item.type === 'pdf') {
            const text = await extractTextFromPdf(item.file);
            combinedText += `\n\n[PDF内容: ${item.file.name}]\n${text}`;
            updatedFiles[i] = { ...updatedFiles[i], status: 'completed', content: text };
          } else if (item.type === 'docx') {
            const text = await extractTextFromDocx(item.file);
            combinedText += `\n\n[Word内容: ${item.file.name}]\n${text}`;
            updatedFiles[i] = { ...updatedFiles[i], status: 'completed', content: text };
          }
        } catch (err) {
          updatedFiles[i] = { ...updatedFiles[i], status: 'error' };
          toast.error(`处理文件 ${item.file.name} 失败`);
        }
      }

      setFiles(updatedFiles);

      // Call Gemini
      const input = geminiInputs.length > 0 ? geminiInputs : combinedText;
      // If we have both images and text, we should probably combine them.
      // For simplicity, if there are images, we send them (Gemini can see text in them).
      // If there's also significant text input, we append it as a text part.
      
      let finalInput: any = input;
      if (geminiInputs.length > 0 && combinedText.trim()) {
        finalInput = [
          ...geminiInputs.map(img => ({ inlineData: img })),
          { text: combinedText }
        ];
      }

      const extracted = await extractPosterInfo(finalInput, {
        scenario: selectedScenario,
        industry: selectedIndustry,
        style: selectedStyle,
        dimension: selectedDimension
      });
      setResult(extracted);
      toast.success('提取成功');
    } catch (error) {
      console.error(error);
      toast.error('提取信息失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearAll = () => {
    setTextInput('');
    setFiles([]);
    setResult(null);
    setSelectedScenario('');
    setSelectedIndustry('');
    setSelectedStyle('');
    setSelectedDimension('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSidebarClick = (category: 'scenario' | 'industry' | 'style' | 'dimension', value: string) => {
    if (category === 'scenario') setSelectedScenario(value === selectedScenario ? '' : value);
    else if (category === 'industry') setSelectedIndustry(value === selectedIndustry ? '' : value);
    else if (category === 'style') setSelectedStyle(value === selectedStyle ? '' : value);
    else if (category === 'dimension') setSelectedDimension(value === selectedDimension ? '' : value);

    // If there is existing content or processing is not happening, we could trigger a re-polish
    // but the user said "click button then polish", so let's check if we should auto-trigger
    if (!isProcessing && (textInput.trim() || files.length > 0)) {
       // We need to wait for state to update or use the fresh 'value'
       // For a better UX, we'll manually call processFiles with the fresh context
    }
  };

  // Effect to re-trigger extraction when selections change if there is content
  React.useEffect(() => {
    if (!isProcessing && (textInput.trim() || files.length > 0)) {
      const timeoutId = setTimeout(() => {
        processFiles(files);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedScenario, selectedIndustry, selectedStyle, selectedDimension]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label}已复制到剪贴板`);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateCommands = () => {
    if (!result) return { cn: '', en: '' };
    
    const content = result.copy || "请添加海报文案";
    const size = result.productInfo.includes('*') ? result.productInfo.match(/\d+\*\d+/)?.[0] || "80*180" : "80*180";
    const style = result.style || "现代简约";
    const requirements = result.imageRequirements || "高质量，细节丰富";
    
    const cn = `我想做一张${size}的${style}风格海报，内容包含完整文案：【${content}】。视觉要求：${requirements}。图片要求字体清晰边缘锐化，文字底部无杂色，整体画面颜色均匀，构图平衡，具有视觉冲击力。`;
    const en = `I want to create an ${size} ${style} style poster, including the full content: "${content}". Visual requirements: ${requirements}. Image requirements: clear font with sharp edges, no noise at the bottom of text, uniform color throughout the image, balanced composition, and strong visual impact.`;
    
    return { cn, en };
  };

  const commands = generateCommands();

  return (
    <div className="min-h-screen bg-[#08080a] text-[#e0e0e6] font-sans overflow-hidden flex">
      {/* Sidebar */}
      <aside className="w-[320px] bg-[#121217] border-r border-white/10 p-6 flex-col gap-8 hidden lg:flex shrink-0">
        <div className="flex items-center gap-3 font-extrabold text-xl text-[#f7e02a] uppercase tracking-wider mb-4">
          <div className="w-7 h-7 bg-[#f7e02a] rounded-md shadow-[0_0_15px_rgba(247,224,42,0.3)] flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          Nano Banana
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <Accordion multiple defaultValue={['item-1', 'item-2', 'item-3', 'item-4']} className="w-full space-y-4">
            <AccordionItem value="item-1" className="border-none">
              <AccordionTrigger className="py-0 hover:no-underline">
                <div className="text-[10px] font-bold text-[#8e8e99] uppercase tracking-widest">场景分类 | Scenarios</div>
              </AccordionTrigger>
              <AccordionContent className="pt-3">
                <div className="grid grid-cols-2 gap-2">
                  {['商业促销', '节日庆典', '招聘海报', '公益宣传', '校园活动', '餐饮美食', '旅游出行', '生活日常', '婚礼生日', '聚会沙龙', '商务发布', '搬家入伙', '开业盛典', '电商详情', '日常分享', '朋友圈晒图'].map(tag => (
                    <div 
                      key={tag} 
                      onClick={() => handleSidebarClick('scenario', tag)}
                      className={cn(
                        "text-[11px] py-2 px-3 rounded-lg border border-white/10 bg-white/5 text-center cursor-pointer transition-all hover:border-[#f7e02a]/50", 
                        selectedScenario === tag && "border-[#f7e02a] text-[#f7e02a] bg-[#f7e02a]/5 shadow-[0_0_10px_rgba(247,224,42,0.1)]"
                      )}
                    >
                      {tag}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="border-none">
              <AccordionTrigger className="py-0 hover:no-underline">
                <div className="text-[10px] font-bold text-[#8e8e99] uppercase tracking-widest">行业细分 | Industries</div>
              </AccordionTrigger>
              <AccordionContent className="pt-3">
                <div className="grid grid-cols-2 gap-2">
                  {['餐饮美食', '教育培训', '婚庆摄影', '美妆护肤', '服装鞋帽', '生活服务', '互联网科技', '金融理财', '医疗健康', '房产家居', '汽车行业', '宠物生活', '亲子母婴', '珠宝饰品', '生鲜水果', '文创潮玩'].map(tag => (
                    <div 
                      key={tag} 
                      onClick={() => handleSidebarClick('industry', tag)}
                      className={cn(
                        "text-[11px] py-2 px-3 rounded-lg border border-white/10 bg-white/5 text-center cursor-pointer transition-all hover:border-[#f7e02a]/50", 
                        selectedIndustry === tag && "border-[#f7e02a] text-[#f7e02a] bg-[#f7e02a]/5 shadow-[0_0_10px_rgba(247,224,42,0.1)]"
                      )}
                    >
                      {tag}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="border-none">
              <AccordionTrigger className="py-0 hover:no-underline">
                <div className="text-[10px] font-bold text-[#8e8e99] uppercase tracking-widest">视觉风格 | Styles</div>
              </AccordionTrigger>
              <AccordionContent className="pt-3">
                <div className="grid grid-cols-2 gap-2">
                  {['中国风', '3D/C4D', '极简主义', '孟菲斯', '波普艺术', '复古国潮', '赛博朋克', '插画风格', '日系清新', '美式复古', '奶油风格', '新中式', '像素艺术', '磨砂玻璃'].map(tag => (
                    <div 
                      key={tag} 
                      onClick={() => handleSidebarClick('style', tag)}
                      className={cn(
                        "text-[11px] py-2 px-3 rounded-lg border border-white/10 bg-white/5 text-center cursor-pointer transition-all hover:border-[#f7e02a]/50", 
                        selectedStyle === tag && "border-[#f7e02a] text-[#f7e02a] bg-[#f7e02a]/5 shadow-[0_0_10px_rgba(247,224,42,0.1)]"
                      )}
                    >
                      {tag}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="border-none">
              <AccordionTrigger className="py-0 hover:no-underline">
                <div className="text-[10px] font-bold text-[#8e8e99] uppercase tracking-widest">常用尺寸 | Dimensions</div>
              </AccordionTrigger>
              <AccordionContent className="pt-3">
                <div className="grid grid-cols-2 gap-2">
                  {['60*160', '80*180', '80*200', '120*200'].map(tag => (
                    <div 
                      key={tag} 
                      onClick={() => handleSidebarClick('dimension', tag)}
                      className={cn(
                        "text-[11px] py-2 px-3 rounded-lg border border-white/10 bg-white/5 text-center cursor-pointer transition-all hover:border-[#f7e02a]/50", 
                        selectedDimension === tag && "border-[#f7e02a] text-[#f7e02a] bg-[#f7e02a]/5 shadow-[0_0_10px_rgba(247,224,42,0.1)]"
                      )}
                    >
                      {tag}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="mt-auto pt-6 border-t border-white/5">
          <div className="bg-white/5 rounded-xl p-4 border border-white/10">
            <div className="flex items-center gap-2 text-xs font-semibold mb-2">
              <Info className="w-3 h-3 text-[#f7e02a]" /> 使用提示
            </div>
            <p className="text-[10px] text-[#8e8e99] leading-relaxed">
              输入原始构思后，AI 将自动结合侧边栏的维度进行智能润色，生成高质量的 Nano Banana 提示词。
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto bg-[radial-gradient(circle_at_70%_30%,#1a1a24_0%,#08080a_70%)]">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header for Mobile */}
          <header className="lg:hidden flex items-center justify-between mb-8">
            <div className="flex items-center gap-3 font-extrabold text-xl text-[#f7e02a] uppercase tracking-wider">
              <div className="w-7 h-7 bg-[#f7e02a] rounded-md shadow-[0_0_15px_rgba(247,224,42,0.3)] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-black" />
              </div>
              Nano Banana
            </div>
            <Button variant="outline" size="sm" onClick={handleClearAll} className="border-white/10 bg-white/5 text-white">
              <Trash2 className="w-4 h-4" />
            </Button>
          </header>

          {/* Input Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold text-[#8e8e99] uppercase tracking-widest">输入你的原始构思 / Input Raw Concept</div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleClearAll} className="h-7 text-[10px] text-[#8e8e99] hover:text-white hidden lg:flex">
                  <Trash2 className="w-3 h-3 mr-1" /> 清空
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => processFiles(files)} 
                  disabled={isProcessing || (!textInput && files.length === 0)}
                  className="h-7 text-[10px] bg-[#f7e02a] text-black hover:bg-[#f7e02a]/90 shadow-[0_4px_20px_rgba(247,224,42,0.3)]"
                >
                  {isProcessing ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                  开始提取
                </Button>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-xl">
              <Textarea 
                placeholder="例如：一个在森林里喝茶的机器人..."
                className="min-h-[100px] border-none focus-visible:ring-0 resize-none p-0 text-lg bg-transparent text-white placeholder:text-white/20"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
              />
              
              <div className="mt-4 flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 text-[11px]"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3 h-3 mr-2" /> 上传素材 (图片/PDF/Word)
                </Button>
                <input 
                  type="file" 
                  multiple 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={(e) => handleFileUpload(e.target.files)}
                  accept="image/*,.pdf,.docx"
                />
                
                {files.map(file => (
                  <Badge key={file.id} variant="secondary" className="h-8 bg-white/10 text-white/80 border-white/10 flex items-center gap-2">
                    {file.type === 'image' ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                    <span className="max-w-[100px] truncate">{file.file.name}</span>
                    <button onClick={() => setFiles(prev => prev.filter(f => f.id !== file.id))} className="hover:text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </section>

          {/* Output Section */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-[10px] font-bold bg-[#81c784]/10 text-[#81c784] px-3 py-1 rounded-full border border-[#81c784]/20">
                <div className="w-1.5 h-1.5 bg-[#81c784] rounded-full animate-pulse" />
                AI 智能润色已就绪
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 md:p-8 shadow-[inset_0_0_40px_rgba(0,0,0,0.2)] min-h-[400px] flex flex-col">
              {!result && !isProcessing ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
                  <Sparkles className="w-12 h-12 mb-4" />
                  <h3 className="text-lg font-medium">等待输入...</h3>
                  <p className="text-sm max-w-xs mt-2">在上方输入原始构思，AI 将为您生成高质量增强提示词</p>
                </div>
              ) : isProcessing ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <RefreshCw className="w-10 h-10 animate-spin text-[#f7e02a] mb-4" />
                  <h3 className="text-lg font-medium">正在深度分析中...</h3>
                </div>
              ) : (
                <div className="space-y-6 flex-1 flex flex-col">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="bg-white/5 p-1 border border-white/10">
                      <TabsTrigger value="extracted" className="text-xs data-[state=active]:bg-[#f7e02a] data-[state=active]:text-black">提取结果</TabsTrigger>
                      <TabsTrigger value="commands" className="text-xs data-[state=active]:bg-[#f7e02a] data-[state=active]:text-black">增强提示词</TabsTrigger>
                      <TabsTrigger value="missing" className="text-xs data-[state=active]:bg-[#f7e02a] data-[state=active]:text-black">缺失信息</TabsTrigger>
                    </TabsList>

                    <TabsContent value="extracted" className="mt-6 space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                        {[
                          { label: '商品款式/尺寸', value: result?.productInfo },
                          { label: '海报风格', value: result?.style },
                          { label: 'Logo/二维码', value: result?.logoQr },
                          { label: '图片素材要求', value: result?.imageRequirements },
                        ].map(item => (
                          <div key={item.label} className="space-y-1">
                            <div className="text-[10px] font-bold text-[#8e8e99] uppercase tracking-widest">{item.label}</div>
                            <div className="text-sm font-medium text-white/90">{item.value || '未识别'}</div>
                          </div>
                        ))}
                      </div>
                      <Separator className="bg-white/5" />
                      <div className="space-y-3">
                        <div className="text-[10px] font-bold text-[#8e8e99] uppercase tracking-widest">核心海报文案</div>
                        <div className="bg-black/20 p-4 rounded-xl border border-white/5 text-sm leading-relaxed whitespace-pre-wrap font-mono">
                          {result?.copy || '未提取到文案'}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="commands" className="mt-6 space-y-6 flex-1 flex flex-col">
                      <div className="space-y-4 flex-1">
                        <div className="space-y-2">
                          <div className="text-[10px] font-bold text-[#8e8e99] uppercase tracking-widest">中文增强指令</div>
                          <div className="bg-black/30 p-5 rounded-xl border-l-4 border-[#f7e02a] text-sm leading-relaxed font-mono relative group">
                            {commands.cn}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => copyToClipboard(commands.cn, '中文指令')}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 bg-white/5"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-[10px] font-bold text-[#8e8e99] uppercase tracking-widest">英文增强指令</div>
                          <div className="bg-black/30 p-5 rounded-xl border-l-4 border-[#f7e02a] text-sm leading-relaxed font-mono relative group">
                            {commands.en}
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => copyToClipboard(commands.en, '英文指令')}
                              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 bg-white/5"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="missing" className="mt-6">
                      <div className="bg-black/20 rounded-xl border border-white/5 overflow-hidden">
                        <Table>
                          <TableHeader className="bg-white/5">
                            <TableRow className="border-white/5 hover:bg-transparent">
                              <TableHead className="text-[10px] uppercase font-bold text-[#8e8e99]">状态</TableHead>
                              <TableHead className="text-[10px] uppercase font-bold text-[#8e8e99]">缺失项目</TableHead>
                              <TableHead className="text-[10px] uppercase font-bold text-[#8e8e99] text-right">建议</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {result?.missingInfo.length === 0 ? (
                              <TableRow className="border-none">
                                <TableCell colSpan={3} className="text-center py-10 text-white/40">
                                  <Check className="w-8 h-8 mx-auto mb-2 text-[#81c784]" />
                                  信息完整
                                </TableCell>
                              </TableRow>
                            ) : (
                              result?.missingInfo.map((info, idx) => (
                                <TableRow key={idx} className="border-white/5 hover:bg-white/5">
                                  <TableCell><Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px]">缺失</Badge></TableCell>
                                  <TableCell className="text-sm text-white/80">{info}</TableCell>
                                  <TableCell className="text-right text-[10px] text-[#8e8e99]">请向客户确认</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </TabsContent>
                  </Tabs>

                  <div className="mt-auto pt-6 flex justify-end gap-3">
                    <Button variant="outline" onClick={handleClearAll} className="border-white/10 bg-white/5 text-white hover:bg-white/10">
                      清空重来
                    </Button>
                    <Button 
                      className="bg-[#f7e02a] text-black hover:bg-[#f7e02a]/90 shadow-[0_4px_20px_rgba(247,224,42,0.3)]"
                      onClick={() => copyToClipboard(activeTab === 'commands' ? commands.cn : result?.copy || '', '内容')}
                    >
                      复制结果
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
