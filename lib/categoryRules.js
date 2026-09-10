// חוקי סיווג לפי מילות מפתח בשם התוכנה / נתיב הקובץ. סדר הרשימה קובע עדיפות בעת התנגשות.
const CATEGORY_RULES = [
  {
    key: "design",
    label: "עיצוב ועריכת תמונה",
    keywords: [
      "photoshop", "lightroom", "illustrator", "indesign", "coreldraw", "corel",
      "gimp", "inkscape", "figma", "canva", "affinity", "photoscape", "picasa",
      "photomate", "paint.net", "paintshop", "capture one", "luminar", "krita",
      "procreate", "sketch", "xd", "designer", "photozoom", "photoworks",
      "draw.io", "drawio", "blender"
    ]
  },
  {
    key: "video",
    label: "עריכת וידאו",
    keywords: [
      "premiere", "after effects", "davinci", "resolve", "vegas", "filmora",
      "camtasia", "obs", "handbrake", "avidemux", "shotcut", "hitfilm",
      "final cut", "movie maker", "video editor"
    ]
  },
  {
    key: "music",
    label: "מוזיקה ואודיו",
    keywords: [
      "fl studio", "ableton", "cubase", "reaper", "audacity", "studio one",
      "logic pro", "garageband", "reason", "nuendo", "pro tools", "soundforge",
      "mixcraft", "foobar", "musescore", "audition", "vlc", "winamp"
    ]
  },
  {
    key: "programming",
    label: "תכנות ופיתוח",
    keywords: [
      "visual studio", "vscode", "code.exe", "cursor", "pycharm", "intellij", "webstorm",
      "android studio", "eclipse", "sublime text", "notepad++", "git", "github",
      "docker", "postman", "xampp", "wamp", "node.js", "putty", "filezilla",
      "sql server management", "mysql workbench", "unity", "unreal", "xcode",
      "rider", "clion", "datagrip", "phpstorm", "vim", "terminal", "cmder",
      "powershell", "anaconda", "jupyter", "python", "idle", "virtualbox",
      "vmware", "wireshark", "mobaxterm", "moba", "ollama", "kubernetes",
      "kubectl", "minikube", "qt linguist", "qt creator", "software development kit",
      " sdk", "arduino", "raspberry", "dbeaver", "wsl", "azure", "terraform",
      "packet tracer"
    ]
  },
  {
    key: "office",
    label: "משרד ומסמכים",
    keywords: [
      "word", "excel", "powerpoint", "outlook", "onenote", "acrobat",
      "adobe reader", "pdf", "office"
    ]
  }
];

const DEFAULT_CATEGORY = { key: "other", label: "כלים נוספים" };

function categorize(text) {
  const lower = text.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) {
      return { key: rule.key, label: rule.label };
    }
  }
  return DEFAULT_CATEGORY;
}

const CATEGORY_ORDER = [...CATEGORY_RULES.map((r) => ({ key: r.key, label: r.label })), DEFAULT_CATEGORY];

module.exports = { categorize, CATEGORY_ORDER };
