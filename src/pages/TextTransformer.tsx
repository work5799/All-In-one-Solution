import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Type, Copy, RefreshCw, Hash, BarChart3, Wrench, Zap, Lock, FileText, Shuffle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const TextTransformer = () => {
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [compareText, setCompareText] = useState("");
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");
  const [passwordLength, setPasswordLength] = useState(12);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loremWords, setLoremWords] = useState(50);
  const [activeTab, setActiveTab] = useState("basic");
  const [generateSubTab, setGenerateSubTab] = useState("password");
  const [tabOutputs, setTabOutputs] = useState({
    basic: "",
    spacing: "",
    case: "",
    format: "",
    find: "",
    analysis: "",
    utility: "",
    generate: {
      password: "",
      lorem: ""
    }
  });
  const [stats, setStats] = useState({ characters: 0, words: 0, sentences: 0, paragraphs: 0, readingTime: 0, keywordDensity: {}, mostUsed: [] });

  // Helper functions for tab-specific outputs
  const getCurrentOutput = () => {
    if (activeTab === "generate") {
      return tabOutputs.generate[generateSubTab as keyof typeof tabOutputs.generate] || "";
    }
    return tabOutputs[activeTab as keyof typeof tabOutputs] || "";
  };

  const setCurrentOutput = (value: string) => {
    setTabOutputs(prev => {
      if (activeTab === "generate") {
        return {
          ...prev,
          generate: {
            ...prev.generate,
            [generateSubTab]: value
          }
        };
      }
      return {
        ...prev,
        [activeTab]: value
      };
    });
  };

  const transformations = [
    { key: "Sc", label: "Sentence case", func: toSentenceCase },
    { key: "lc", label: "lower case", func: toLowerCase },
    { key: "UC", label: "UPPER CASE", func: toUpperCase },
    { key: "CC", label: "Capitalized Case", func: toCapitalizedCase },
    { key: "aC", label: "aLtErNaTiNg cAsE", func: toAlternatingCase },
    { key: "TC", label: "Title Case", func: toTitleCase },
    { key: "iC", label: "InVeRsE CaSe", func: toInverseCase },
  ];

  // Transformation functions
  function toSentenceCase(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  function toLowerCase(text: string): string {
    return text.toLowerCase();
  }

  function toUpperCase(text: string): string {
    return text.toUpperCase();
  }

  function toCapitalizedCase(text: string): string {
    return text.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  }

  function toAlternatingCase(text: string): string {
    return text.split('').map((char, index) => index % 2 === 0 ? char.toUpperCase() : char.toLowerCase()).join('');
  }

  function toTitleCase(text: string): string {
    return text.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
  }

  function toInverseCase(text: string): string {
    return text.split('').map(char => char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase()).join('');
  }

  // Spacing functions
  const removeHyperlinks = (text: string) => text.replace(/https?:\/\/[^\s]+/g, '');
  const removeExtraSpaces = (text: string) => text.replace(/\s+/g, ' ');
  const trimSpaces = (text: string) => text.trim();
  const removeAllSpaces = (text: string) => text.replace(/\s/g, '');
  const removeLineBreaks = (text: string) => text.replace(/\n/g, '');
  const removeEmptyLines = (text: string) => text.replace(/^\s*$[\n\r]+/gm, '');
  const normalizeSpacing = (text: string) => text.replace(/\s+/g, ' ').trim();
  const addSpaceAfterPunctuation = (text: string) => text.replace(/([.!?])(?=\S)/g, '$1 ');
  const removeTabs = (text: string) => text.replace(/\t/g, '');

  // Case functions
  const toCamelCase = (text: string) => text.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => index === 0 ? word.toLowerCase() : word.toUpperCase()).replace(/\s+/g, '');
  const toPascalCase = (text: string) => text.replace(/(?:^\w|[A-Z]|\b\w)/g, word => word.toUpperCase()).replace(/\s+/g, '');
  const toSnakeCase = (text: string) => text.toLowerCase().replace(/\s+/g, '_');
  const toKebabCase = (text: string) => text.toLowerCase().replace(/\s+/g, '-');
  const toConstantCase = (text: string) => text.toUpperCase().replace(/\s+/g, '_');
  const toDotCase = (text: string) => text.toLowerCase().replace(/\s+/g, '.');
  const toPathCase = (text: string) => text.toLowerCase().replace(/\s+/g, '/');
  const toHeaderCase = (text: string) => text.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join('-');

  // Formatting functions
  const toBold = (text: string) => `**${text}**`;
  const toItalic = (text: string) => `_${text}_`;
  const toUnderline = (text: string) => `<u>${text}</u>`;
  const toStrikethrough = (text: string) => `~~${text}~~`;
  const wrapWithQuotes = (text: string) => `"${text}"`;
  const addPrefixSuffix = (text: string) => `${prefix}${text}${suffix}`;
  const addBullets = (text: string) => text.split('\n').map(line => `• ${line}`).join('\n');
  const numberedList = (text: string) => text.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n');

  // Find & Replace functions
  const replaceFirst = (text: string) => text.replace(findText, replaceText);
  const replaceAll = (text: string) => text.replaceAll(findText, replaceText);
  const removeSpecific = (text: string) => text.replaceAll(findText, '');
  const regexReplace = (text: string) => text.replace(new RegExp(findText, 'g'), replaceText);

  // Analysis functions
  const calculateStats = (text: string) => {
    const characters = text.length;
    const words = text.trim().split(/\s+/).filter(word => word).length;
    const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length;
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim()).length;
    const readingTime = Math.ceil(words / 200);

    const wordList = text.toLowerCase().match(/\b\w+\b/g) || [];
    const wordCount: { [key: string]: number } = {};
    wordList.forEach(word => wordCount[word] = (wordCount[word] || 0) + 1);
    const sortedWords = Object.entries(wordCount).sort((a, b) => b[1] - a[1]);
    const mostUsed = sortedWords.slice(0, 10).map(([word, count]) => `${word}: ${count}`);

    const keywordDensity: { [key: string]: number } = {};
    sortedWords.forEach(([word, count]) => keywordDensity[word] = (count / words) * 100);

    return { characters, words, sentences, paragraphs, readingTime, keywordDensity, mostUsed };
  };

  // Utility functions
  const sortLinesAZ = (text: string) => text.split('\n').sort().join('\n');
  const sortLinesZA = (text: string) => text.split('\n').sort().reverse().join('\n');
  const reverseText = (text: string) => text.split('').reverse().join('');
  const reverseEachWord = (text: string) => text.split(' ').map(word => word.split('').reverse().join('')).join(' ');
  const shuffleText = (text: string) => text.split(' ').sort(() => Math.random() - 0.5).join(' ');
  const removeDuplicateLines = (text: string) => [...new Set(text.split('\n'))].join('\n');
  const uniqueWordsExtract = (text: string) => [...new Set(text.toLowerCase().match(/\b\w+\b/g) || [])].join(' ');
  const base64Encode = (text: string) => btoa(text);
  const base64Decode = (text: string) => atob(text);
  const urlEncode = (text: string) => encodeURIComponent(text);
  const urlDecode = (text: string) => decodeURIComponent(text);
  const htmlEncode = (text: string) => text.replace(/[<>&"']/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[m] || m));
  const htmlDecode = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const textToBinary = (text: string) => text.split('').map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
  const binaryToText = (text: string) => text.split(' ').map(b => String.fromCharCode(parseInt(b, 2))).join('');
  const textToAscii = (text: string) => text.split('').map(c => c.charCodeAt(0)).join(' ');
  const asciiToText = (text: string) => text.split(' ').map(a => String.fromCharCode(parseInt(a))).join('');
  const removeDuplicateWords = (text: string) => text.split(' ').filter((word, index, arr) => arr.indexOf(word) === index).join(' ');
  const isPalindrome = (text: string) => {
    const clean = text.replace(/\s/g, '').toLowerCase();
    return clean === clean.split('').reverse().join('');
  };
  const textDiff = (text1: string, text2: string) => {
    const lines1 = text1.split('\n');
    const lines2 = text2.split('\n');
    const diff = [];
    const maxLen = Math.max(lines1.length, lines2.length);
    for (let i = 0; i < maxLen; i++) {
      if (lines1[i] !== lines2[i]) {
        diff.push(`- ${lines1[i] || ''}`);
        diff.push(`+ ${lines2[i] || ''}`);
      } else {
        diff.push(`  ${lines1[i]}`);
      }
    }
    return diff.join('\n');
  };
  const generateLoremIpsum = (words: number) => {
    const lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";
    const loremWords = lorem.split(' ');
    let result = [];
    for (let i = 0; i < words; i++) {
      result.push(loremWords[i % loremWords.length]);
    }
    return result.join(' ');
  };

  const getPasswordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  };

  const getStrengthLabel = (strength: number) => {
    if (strength <= 2) return { label: "Weak", color: "bg-red-500" };
    if (strength <= 4) return { label: "Medium", color: "bg-yellow-500" };
    return { label: "Strong", color: "bg-green-500" };
  };
  const generateSlug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const extractEmails = (text: string) => text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g)?.join('\n') || '';
  const extractUrls = (text: string) => text.match(/https?:\/\/[^\s]+/g)?.join('\n') || '';
  const extractNumbers = (text: string) => text.match(/\d+/g)?.join(' ') || '';
  const removePunctuation = (text: string) => text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
  const generatePassword = () => {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    let chars = '';
    if (includeLowercase) chars += lowercase;
    if (includeUppercase) chars += uppercase;
    if (includeNumbers) chars += numbers;
    if (includeSymbols) chars += symbols;
    if (!chars) chars = lowercase;
    let password = '';
    for (let i = 0; i < passwordLength; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleTransform = (func: (text: string) => string) => {
    const result = func(inputText);
    setCurrentOutput(result);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getCurrentOutput());
    toast.success("Copied to clipboard!");
  };

  const handleAI = () => {
    const randomTransform = transformations[Math.floor(Math.random() * transformations.length)];
    const result = randomTransform.func(inputText);
    setCurrentOutput(result);
    toast.success(`AI applied ${randomTransform.label}!`);
  };

  const handleAnalyze = () => {
    const newStats = calculateStats(inputText);
    setStats(newStats);
    setCurrentOutput(`Characters: ${newStats.characters}\nWords: ${newStats.words}\nSentences: ${newStats.sentences}\nParagraphs: ${newStats.paragraphs}\nReading Time: ${newStats.readingTime} min\n\nMost Used Words:\n${newStats.mostUsed.join('\n')}`);
  };

  const handleDiff = () => {
    const result = textDiff(inputText, compareText);
    setCurrentOutput(result);
  };

  const handleGeneratePassword = () => {
    const password = generatePassword();
    setCurrentOutput(password);
  };

  const handleGenerateLorem = () => {
    const lorem = generateLoremIpsum(loremWords);
    setCurrentOutput(lorem);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Text Transformer</h1>
        <p className="text-muted-foreground">Transform your text with various case styles, formatting, and AI-powered functions</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="w-5 h-5" />
            Input Text
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Enter your text here..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="min-h-[100px]"
          />
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="spacing">Spacing</TabsTrigger>
          <TabsTrigger value="case">Case</TabsTrigger>
          <TabsTrigger value="format">Format</TabsTrigger>
          <TabsTrigger value="find">Find/Replace</TabsTrigger>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="utility">Utility</TabsTrigger>
          <TabsTrigger value="generate">Generate</TabsTrigger>
        </TabsList>

        <TabsContent value="basic">
          <Card>
            <CardHeader>
              <CardTitle>Basic Transformations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                {transformations.map((t) => (
                  <Button
                    key={t.key}
                    onClick={() => handleTransform(t.func)}
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-center gap-2"
                  >
                    <Badge variant="secondary">{t.key}</Badge>
                    <span className="text-sm">{t.label}</span>
                  </Button>
                ))}
                <Button
                  onClick={handleAI}
                  className="h-auto p-4 flex flex-col items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-sm">AI Transform</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="spacing">
          <Card>
            <CardHeader>
              <CardTitle>Spacing & Cleaning</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button
                  onClick={() => handleTransform(removeHyperlinks)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Hyperlink Remover</span>
                </Button>
                <Button
                  onClick={() => handleTransform(removeExtraSpaces)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Remove Extra Spaces</span>
                </Button>
                <Button
                  onClick={() => handleTransform(trimSpaces)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Trim Start/End Spaces</span>
                </Button>
                <Button
                  onClick={() => handleTransform(removeAllSpaces)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Remove All Spaces</span>
                </Button>
                <Button
                  onClick={() => handleTransform(removeLineBreaks)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Remove Line Breaks</span>
                </Button>
                <Button
                  onClick={() => handleTransform(removeEmptyLines)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Remove Empty Lines</span>
                </Button>
                <Button
                  onClick={() => handleTransform(normalizeSpacing)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Normalize Spacing</span>
                </Button>
                <Button
                  onClick={() => handleTransform(addSpaceAfterPunctuation)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Add Space After Punctuation</span>
                </Button>
                <Button
                  onClick={() => handleTransform(removeTabs)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Remove Tabs</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="case">
          <Card>
            <CardHeader>
              <CardTitle>Case Conversions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button
                  onClick={() => handleTransform(toCamelCase)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">camelCase</span>
                </Button>
                <Button
                  onClick={() => handleTransform(toPascalCase)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">PascalCase</span>
                </Button>
                <Button
                  onClick={() => handleTransform(toSnakeCase)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">snake_case</span>
                </Button>
                <Button
                  onClick={() => handleTransform(toKebabCase)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">kebab-case</span>
                </Button>
                <Button
                  onClick={() => handleTransform(toConstantCase)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">CONSTANT_CASE</span>
                </Button>
                <Button
                  onClick={() => handleTransform(toDotCase)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">dot.case</span>
                </Button>
                <Button
                  onClick={() => handleTransform(toPathCase)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">path/case</span>
                </Button>
                <Button
                  onClick={() => handleTransform(toHeaderCase)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Header-Case</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="format">
          <Card>
            <CardHeader>
              <CardTitle>Formatting</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <Button
                  onClick={() => handleTransform(toBold)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Bold</span>
                </Button>
                <Button
                  onClick={() => handleTransform(toItalic)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Italic</span>
                </Button>
                <Button
                  onClick={() => handleTransform(toUnderline)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Underline</span>
                </Button>
                <Button
                  onClick={() => handleTransform(toStrikethrough)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Strikethrough</span>
                </Button>
                <Button
                  onClick={() => handleTransform(wrapWithQuotes)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Wrap with Quotes</span>
                </Button>
                <Button
                  onClick={() => handleTransform(addBullets)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Add Bullet Points</span>
                </Button>
                <Button
                  onClick={() => handleTransform(numberedList)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Numbered List</span>
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="prefix">Prefix</Label>
                  <Input id="prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="suffix">Suffix</Label>
                  <Input id="suffix" value={suffix} onChange={(e) => setSuffix(e.target.value)} />
                </div>
              </div>
              <Button
                onClick={() => handleTransform(addPrefixSuffix)}
                className="mt-4 h-12 hover:bg-[#14b8aa] transition-colors"
                variant="outline"
              >
                Add Prefix/Suffix
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="find">
          <Card>
            <CardHeader>
              <CardTitle>Find & Replace</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <Label htmlFor="find">Find</Label>
                  <Input id="find" value={findText} onChange={(e) => setFindText(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="replace">Replace</Label>
                  <Input id="replace" value={replaceText} onChange={(e) => setReplaceText(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button
                  onClick={() => handleTransform(replaceFirst)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Replace First</span>
                </Button>
                <Button
                  onClick={() => handleTransform(replaceAll)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Replace All</span>
                </Button>
                <Button
                  onClick={() => handleTransform(removeSpecific)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Remove Specific</span>
                </Button>
                <Button
                  onClick={() => handleTransform(regexReplace)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Regex Replace</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis">
          <Card>
            <CardHeader>
              <CardTitle>Text Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button
                  onClick={handleAnalyze}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Analyze Text</span>
                </Button>
              </div>
              <div className="mt-4 p-4 bg-muted rounded">
                <p><strong>Characters:</strong> {stats.characters}</p>
                <p><strong>Words:</strong> {stats.words}</p>
                <p><strong>Sentences:</strong> {stats.sentences}</p>
                <p><strong>Paragraphs:</strong> {stats.paragraphs}</p>
                <p><strong>Reading Time:</strong> {stats.readingTime} min</p>
                <p><strong>Most Used Words:</strong></p>
                <ul>
                  {stats.mostUsed.map((word, i) => <li key={i}>{word}</li>)}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="utility">
          <Card>
            <CardHeader>
              <CardTitle>Utilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <Button
                  onClick={() => handleTransform(sortLinesAZ)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Sort Lines A→Z</span>
                </Button>
                <Button
                  onClick={() => handleTransform(sortLinesZA)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Sort Z→A</span>
                </Button>
                <Button
                  onClick={() => handleTransform(reverseText)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Reverse Text</span>
                </Button>
                <Button
                  onClick={() => handleTransform(reverseEachWord)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Reverse Each Word</span>
                </Button>
                <Button
                  onClick={() => handleTransform(shuffleText)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Shuffle Text</span>
                </Button>
                <Button
                  onClick={() => handleTransform(removeDuplicateLines)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Remove Duplicate Lines</span>
                </Button>
                <Button
                  onClick={() => handleTransform(uniqueWordsExtract)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Unique Words Extract</span>
                </Button>
                <Button
                  onClick={() => handleTransform(removeDuplicateWords)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Remove Duplicate Words</span>
                </Button>
                <Button
                  onClick={() => handleTransform(removePunctuation)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Remove Punctuation</span>
                </Button>
                <Button
                  onClick={() => handleTransform(base64Encode)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Base64 Encode</span>
                </Button>
                <Button
                  onClick={() => handleTransform(base64Decode)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Base64 Decode</span>
                </Button>
                <Button
                  onClick={() => handleTransform(urlEncode)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">URL Encode</span>
                </Button>
                <Button
                  onClick={() => handleTransform(urlDecode)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">URL Decode</span>
                </Button>
                <Button
                  onClick={() => handleTransform(htmlEncode)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">HTML Encode</span>
                </Button>
                <Button
                  onClick={() => handleTransform(htmlDecode)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">HTML Decode</span>
                </Button>
                <Button
                  onClick={() => handleTransform(textToBinary)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Text → Binary</span>
                </Button>
                <Button
                  onClick={() => handleTransform(binaryToText)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Binary → Text</span>
                </Button>
                <Button
                  onClick={() => handleTransform(textToAscii)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Text → ASCII</span>
                </Button>
                <Button
                  onClick={() => handleTransform(asciiToText)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">ASCII → Text</span>
                </Button>
                <Button
                  onClick={() => handleTransform(generateSlug)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Slug Generator</span>
                </Button>
                <Button
                  onClick={() => handleTransform(extractEmails)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Extract Emails</span>
                </Button>
                <Button
                  onClick={() => handleTransform(extractUrls)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Extract URLs</span>
                </Button>
                <Button
                  onClick={() => handleTransform(extractNumbers)}
                  variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-2 hover:bg-[#14b8aa] transition-colors"
                >
                  <span className="text-sm font-medium">Extract Numbers</span>
                </Button>
              </div>
              <div className="mb-4">
                <Label>Palindrome Checker</Label>
                <p className="text-sm text-muted-foreground">Result: {isPalindrome(inputText) ? 'Yes' : 'No'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Compare Text</Label>
                  <Textarea value={compareText} onChange={(e) => setCompareText(e.target.value)} placeholder="Enter text to compare..." />
                </div>
                <div>
                  <Button
                    onClick={handleDiff}
                    className="mt-8 h-12 hover:bg-[#14b8aa] transition-colors"
                    variant="outline"
                  >
                    Compare Texts (Diff)
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="generate">
          <Tabs value={generateSubTab} onValueChange={setGenerateSubTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="password" className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Password Generator
              </TabsTrigger>
              <TabsTrigger value="lorem" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Lorem Ipsum Generator
              </TabsTrigger>
            </TabsList>

            {/* Password Generator Tab */}
            <TabsContent value="password" className="space-y-6">
              <Card className="border-l-4 border-l-[#14b8aa]">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-[#14b8aa]/10 rounded-lg">
                      <Lock className="w-6 h-6 text-[#14b8aa]" />
                    </div>
                    <span>Password Generator</span>
                    <Badge variant="secondary" className="ml-auto">Secure</Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Generate strong, customizable passwords with advanced options</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Password Display */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Generated Password</Label>
                    <div className="flex gap-2">
                      <Input
                        value={getCurrentOutput()}
                        readOnly
                        type={showPassword ? "text" : "password"}
                        className="font-mono text-lg"
                        placeholder="Click generate to create password..."
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowPassword(!showPassword)}
                        className="hover:bg-[#14b8aa] transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopy}
                        className="hover:bg-[#14b8aa] transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    {getCurrentOutput() && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${getStrengthLabel(getPasswordStrength(getCurrentOutput())).color}`}
                            style={{ width: `${(getPasswordStrength(getCurrentOutput()) / 6) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">
                          {getStrengthLabel(getPasswordStrength(getCurrentOutput())).label}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="password-length" className="text-sm font-medium">Password Length</Label>
                        <div className="flex items-center gap-3 mt-2">
                          <Input
                            id="password-length"
                            type="range"
                            min="4"
                            max="32"
                            value={passwordLength}
                            onChange={(e) => setPasswordLength(parseInt(e.target.value))}
                            className="flex-1"
                          />
                          <span className="w-12 text-center font-mono text-lg">{passwordLength}</span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Character Types</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="lowercase"
                              checked={includeLowercase}
                              onCheckedChange={setIncludeLowercase}
                            />
                            <Label htmlFor="lowercase" className="text-sm">Lowercase (a-z)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="uppercase"
                              checked={includeUppercase}
                              onCheckedChange={setIncludeUppercase}
                            />
                            <Label htmlFor="uppercase" className="text-sm">Uppercase (A-Z)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="numbers"
                              checked={includeNumbers}
                              onCheckedChange={setIncludeNumbers}
                            />
                            <Label htmlFor="numbers" className="text-sm">Numbers (0-9)</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="symbols"
                              checked={includeSymbols}
                              onCheckedChange={setIncludeSymbols}
                            />
                            <Label htmlFor="symbols" className="text-sm">Symbols (!@#$%)</Label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col justify-center">
                      <Button
                        onClick={handleGeneratePassword}
                        className="h-14 text-lg font-medium bg-[#14b8aa] hover:bg-[#14b8aa]/90 transition-colors"
                        size="lg"
                      >
                        <Shuffle className="w-5 h-5 mr-2" />
                        Generate Password
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        Secure password generation with entropy-based randomization
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Lorem Ipsum Generator Tab */}
            <TabsContent value="lorem" className="space-y-6">
              <Card className="border-l-4 border-l-[#14b8aa]">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 bg-[#14b8aa]/10 rounded-lg">
                      <FileText className="w-6 h-6 text-[#14b8aa]" />
                    </div>
                    <span>Lorem Ipsum Generator</span>
                    <Badge variant="secondary" className="ml-auto">Content</Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Generate placeholder text for design and development</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                      <Label htmlFor="lorem-words" className="text-sm font-medium">Number of Words</Label>
                      <Select value={loremWords.toString()} onValueChange={(value) => setLoremWords(parseInt(value))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="25">25 words</SelectItem>
                          <SelectItem value="50">50 words</SelectItem>
                          <SelectItem value="100">100 words</SelectItem>
                          <SelectItem value="150">150 words</SelectItem>
                          <SelectItem value="200">200 words</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <Button
                        onClick={handleGenerateLorem}
                        className="w-full h-12 bg-[#14b8aa] hover:bg-[#14b8aa]/90 transition-colors"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Generate Lorem Ipsum
                      </Button>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">
                      <strong>What is Lorem Ipsum?</strong><br />
                      Lorem Ipsum is simply dummy text of the printing and typesetting industry. It has been the industry's standard dummy text ever since the 1500s.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Output Text Card - Hidden when Password Generator is active */}
      {!(activeTab === "generate" && generateSubTab === "password") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Output Text
              <div className="flex gap-2">
                <Button onClick={handleCopy} size="sm" variant="outline">
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
                <Button onClick={() => setCurrentOutput("")} size="sm" variant="outline">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={getCurrentOutput()}
              readOnly
              className="min-h-[100px]"
              placeholder="Transformed text will appear here..."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TextTransformer;