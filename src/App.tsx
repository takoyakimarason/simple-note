import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Moon, Sun, Share2, Check, Loader2, FileText, Palette, Eye, PenLine, ExternalLink
} from 'lucide-react';

// --- 環境変数から設定を読み込み ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ユーティリティ ---
function useDebounce(value: any, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
    return () => { clearTimeout(handler); };
  }, [value, delay]);
  return debouncedValue;
}

// URLをリンクに変換して表示するコンポーネント
const LinkifiedText = ({ text, className, style }: { text: string, className?: string, style?: React.CSSProperties }) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return (
    <div className={className} style={style}>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <a 
              key={i} 
              href={part} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-blue-500 hover:underline inline-flex items-center gap-0.5 align-middle"
              onClick={(e) => e.stopPropagation()}
            >
              {part} <ExternalLink size={14} className="opacity-70" />
            </a>
          );
        }
        return part;
      })}
    </div>
  );
};

const TEXT_COLORS = [
  { label: '自動', value: 'default', class: 'bg-gradient-to-br from-gray-500 to-gray-400' },
  { label: '赤', value: '#ef4444', class: 'bg-red-500' },
  { label: 'オレンジ', value: '#f97316', class: 'bg-orange-500' },
  { label: '緑', value: '#22c55e', class: 'bg-green-500' },
  { label: '青', value: '#3b82f6', class: 'bg-blue-500' },
  { label: '紫', value: '#a855f7', class: 'bg-purple-500' },
];

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [noteId, setNoteId] = useState('');
  const [content, setContent] = useState('');
  const [textColor, setTextColor] = useState('default');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [status, setStatus] = useState('idle');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLanding, setIsLanding] = useState(true);
  const [isPreview, setIsPreview] = useState(false); // 閲覧モードの状態
  
  const [localContent, setLocalContent] = useState('');
  const debouncedContent = useDebounce(localContent, 1000);
  const isRemoteUpdate = useRef(false);

  // --- Auth Initialization ---
  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- Hash Routing & Theme ---
  useEffect(() => {
    const checkHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash) {
        setNoteId(decodeURIComponent(hash));
        setIsLanding(false);
      } else {
        setIsLanding(true);
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
    }
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  // --- Firestore Listener ---
  useEffect(() => {
    if (!user || !noteId) return;
    setStatus('loading');
    
    const noteRef = doc(collection(db, 'notes'), noteId);

    const unsubscribe = onSnapshot(noteRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const text = data.text || '';
        const color = data.textColor || 'default';
        
        if (text !== localContent) {
            isRemoteUpdate.current = true;
            setLocalContent(text);
            setContent(text);
        }
        setTextColor(color);
      } else {
        isRemoteUpdate.current = true;
        setLocalContent('');
        setContent('');
        setTextColor('default');
      }
      setStatus('idle');
    }, (error) => {
      console.error("Firestore read error:", error);
      setStatus('error');
    });
    return () => unsubscribe();
  }, [user, noteId]);

  // --- Save Logic ---
  useEffect(() => {
    if (!user || !noteId) return;
    if (debouncedContent === content) return;

    const saveToFirestore = async () => {
      setStatus('saving');
      try {
        const noteRef = doc(collection(db, 'notes'), noteId);
        await setDoc(noteRef, {
          text: debouncedContent,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid
        }, { merge: true });
        
        setContent(debouncedContent);
        setStatus('saved');
        setTimeout(() => setStatus('idle'), 2000);
      } catch (error) {
        console.error("Save error:", error);
        setStatus('error');
      }
    };
    saveToFirestore();
  }, [debouncedContent, user, noteId]);

  // --- Handlers ---
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    isRemoteUpdate.current = false;
    setLocalContent(e.target.value);
    setStatus('typing');
  };

  const handleCreateNote = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('noteName') as HTMLInputElement;
    let name = input.value.trim();
    if (!name) name = Math.random().toString(36).substring(2, 8);
    window.location.hash = name;
  };

  const handleColorChange = async (colorValue: string) => {
    setTextColor(colorValue);
    setShowColorPicker(false);
    if (!user || !noteId) return;
    try {
      const noteRef = doc(collection(db, 'notes'), noteId);
      await setDoc(noteRef, { textColor: colorValue }, { merge: true });
    } catch (error) { console.error(error); }
  };

  const copyUrl = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        setStatus('copied');
        setTimeout(() => setStatus('idle'), 2000);
    }).catch(() => {
        document.execCommand('copy'); 
    });
  };
  
  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // --- Render ---
  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDarkMode ? 'bg-neutral-900 text-neutral-200' : 'bg-white text-neutral-800'}`}>
      
      {!user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      )}

      {isLanding ? (
        <div className="flex flex-col items-center justify-center h-screen px-4">
          <div className="max-w-md w-full text-center space-y-8">
            <div className="space-y-2">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white mb-4">
                <FileText size={32} />
              </div>
              <h1 className="text-4xl font-bold tracking-tight">SimpleNote</h1>
              <p className={`text-lg ${isDarkMode ? 'text-neutral-400' : 'text-neutral-500'}`}>
                シンプルで共有可能な、Web上のメモ帳。<br/>
                ログイン不要、すぐに書き始められます。
              </p>
            </div>

            <form onSubmit={handleCreateNote} className="flex gap-2">
              <input
                name="noteName"
                type="text"
                placeholder="ページ名 (例: idea-2024)"
                className={`flex-1 px-4 py-3 rounded-lg text-lg outline-none border transition-all ${
                  isDarkMode 
                    ? 'bg-neutral-800 border-neutral-700 focus:border-blue-500 text-white placeholder-neutral-500' 
                    : 'bg-neutral-50 border-neutral-200 focus:border-blue-500 text-black placeholder-neutral-400'
                }`}
                autoFocus
              />
              <button 
                type="submit"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                作成
              </button>
            </form>
            <p className="text-sm text-neutral-500">※ 同じページ名を知っている人は誰でも閲覧・編集できます。</p>
          </div>
          <button onClick={toggleTheme} className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      ) : (
        <div className="flex flex-col h-screen">
          <header className={`flex items-center justify-between px-4 py-3 border-b ${isDarkMode ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-100 bg-white'}`}>
            <div className="flex items-center gap-3 overflow-hidden">
              <a href="#" className="flex-shrink-0 text-blue-500 hover:text-blue-600 transition-colors"><FileText size={20} /></a>
              <h1 className="text-sm font-mono font-medium truncate max-w-[200px] opacity-70">/{noteId}</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="mr-2 text-xs font-medium transition-colors duration-300">
                {status === 'saving' && <span className="text-amber-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin"/> 保存中...</span>}
                {status === 'saved' && <span className="text-green-500 flex items-center gap-1"><Check size={12}/> 保存完了</span>}
                {status === 'typing' && <span className="text-neutral-400">入力中...</span>}
                {status === 'error' && <span className="text-red-500">エラー</span>}
                {status === 'copied' && <span className="text-blue-500">URLコピー完了</span>}
              </div>

              {/* 閲覧モード切り替えボタン */}
              <button 
                onClick={() => setIsPreview(!isPreview)}
                title={isPreview ? "編集モードに戻る" : "閲覧モード（リンク有効）"}
                className={`p-2 rounded-md transition-colors ${
                  isPreview 
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300' 
                    : (isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-neutral-100 text-neutral-500')
                }`}
              >
                {isPreview ? <PenLine size={18} /> : <Eye size={18} />}
              </button>

              <button onClick={copyUrl} className={`p-2 rounded-md transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-neutral-100 text-neutral-500'}`}><Share2 size={18} /></button>
              <div className="relative">
                <button onClick={() => setShowColorPicker(!showColorPicker)} className={`p-2 rounded-md transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-neutral-100 text-neutral-500'}`}><Palette size={18} /></button>
                {showColorPicker && (
                  <div className={`absolute top-full right-0 mt-2 p-2 rounded-xl shadow-xl border grid grid-cols-3 gap-2 z-50 w-32 ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200'}`}>
                    {TEXT_COLORS.map((c) => (
                      <button key={c.value} onClick={() => handleColorChange(c.value)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${c.class} ${textColor === c.value ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}>
                        {textColor === c.value && <Check size={14} className="text-white drop-shadow-md" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={toggleTheme} className={`p-2 rounded-md transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-neutral-100 text-neutral-500'}`}>{isDarkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            </div>
          </header>
          <main className="flex-1 relative overflow-hidden">
             {isPreview ? (
                // 閲覧モード（リンク有効）
                <div className="w-full h-full overflow-y-auto">
                    <LinkifiedText 
                        text={localContent} 
                        className={`min-h-full p-4 md:p-8 md:text-lg outline-none font-mono leading-relaxed whitespace-pre-wrap break-words transition-colors ${
                            isDarkMode 
                            ? 'bg-neutral-900 placeholder-neutral-700' 
                            : 'bg-white placeholder-neutral-300'
                        } ${textColor === 'default' ? (isDarkMode ? 'text-neutral-200' : 'text-neutral-800') : ''}`}
                        style={{ color: textColor === 'default' ? undefined : textColor }}
                    />
                </div>
             ) : (
                // 編集モード（入力欄）
                <textarea 
                    value={localContent} 
                    onChange={handleContentChange} 
                    placeholder="ここにメモを入力..." 
                    style={{ color: textColor === 'default' ? undefined : textColor }} 
                    className={`w-full h-full p-4 md:p-8 md:text-lg resize-none outline-none font-mono leading-relaxed transition-colors ${
                        isDarkMode 
                        ? 'bg-neutral-900 placeholder-neutral-700' 
                        : 'bg-white placeholder-neutral-300'
                    } ${textColor === 'default' ? (isDarkMode ? 'text-neutral-200' : 'text-neutral-800') : ''}`} 
                    spellCheck={false} 
                />
             )}
          </main>
        </div>
      )}
    </div>
  );
}