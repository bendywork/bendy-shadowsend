import {
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Copy,
  CornerDownLeft,
  Crown,
  DoorOpen,
  Download,
  FileText,
  LoaderCircle,
  Megaphone,
  MoonStar,
  MoreHorizontal,
  PanelLeft,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  PlusCircle,
  QrCode,
  SendHorizonal,
  Settings2,
  Shield,
  Sparkles,
  SunMedium,
  Trash2,
  UserMinus,
  Users,
  X,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

/**
 * 图标规范（ui-07）
 *
 * - 全站图标只能从本模块具名导入，禁止业务文件直接依赖 lucide-react。
 * - 尺寸走 6 档 token，默认 md（16px）；线宽默认 1.75px 且使用
 *   absoluteStrokeWidth，保证不同尺寸下视觉粗细一致。
 * - 纯装饰图标默认 aria-hidden；有语义时传 label，自动补 role="img"。
 */
export const ICON_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
} as const;

export type IconSize = keyof typeof ICON_SIZES;

export const ICON_STROKE_WIDTH = 1.75;

export type IconProps = Omit<LucideProps, "size" | "strokeWidth"> & {
  size?: IconSize | number;
  strokeWidth?: number;
  /** 有语义的图标传入可读标签；装饰性图标留空并自动 aria-hidden。 */
  label?: string;
};

/** 把「视觉线宽 px」换算成 24 视图坐标下的 stroke-width。 */
export function getIconStrokeWidth(size: IconSize | number, strokeWidth = ICON_STROKE_WIDTH) {
  const pixels = typeof size === "number" ? size : ICON_SIZES[size];
  return (strokeWidth * 24) / pixels;
}

function createIcon(Glyph: LucideIcon, displayName: string) {
  function Icon({
    size = "md",
    strokeWidth = ICON_STROKE_WIDTH,
    label,
    ...rest
  }: IconProps) {
    const pixels = typeof size === "number" ? size : ICON_SIZES[size];

    return (
      <Glyph
        size={pixels}
        strokeWidth={getIconStrokeWidth(pixels, strokeWidth)}
        aria-hidden={label ? undefined : true}
        aria-label={label}
        role={label ? "img" : undefined}
        focusable="false"
        {...rest}
      />
    );
  }

  Icon.displayName = displayName;
  return Icon;
}

export const CheckIcon = createIcon(Check, "CheckIcon");
export const CheckCheckIcon = createIcon(CheckCheck, "CheckCheckIcon");
export const ChevronRightIcon = createIcon(ChevronRight, "ChevronRightIcon");
export const ClockIcon = createIcon(Clock3, "ClockIcon");
export const CopyIcon = createIcon(Copy, "CopyIcon");
export const CornerDownLeftIcon = createIcon(CornerDownLeft, "CornerDownLeftIcon");
export const CrownIcon = createIcon(Crown, "CrownIcon");
export const DoorOpenIcon = createIcon(DoorOpen, "DoorOpenIcon");
export const DownloadIcon = createIcon(Download, "DownloadIcon");
export const FileTextIcon = createIcon(FileText, "FileTextIcon");
export const LoaderCircleIcon = createIcon(LoaderCircle, "LoaderCircleIcon");
export const MegaphoneIcon = createIcon(Megaphone, "MegaphoneIcon");
export const MoonStarIcon = createIcon(MoonStar, "MoonStarIcon");
export const MoreHorizontalIcon = createIcon(MoreHorizontal, "MoreHorizontalIcon");
export const PanelLeftIcon = createIcon(PanelLeft, "PanelLeftIcon");
export const PanelLeftCloseIcon = createIcon(PanelLeftClose, "PanelLeftCloseIcon");
export const PanelRightCloseIcon = createIcon(PanelRightClose, "PanelRightCloseIcon");
export const PlusIcon = createIcon(Plus, "PlusIcon");
export const PlusCircleIcon = createIcon(PlusCircle, "PlusCircleIcon");
export const QrCodeIcon = createIcon(QrCode, "QrCodeIcon");
export const SendIcon = createIcon(SendHorizonal, "SendIcon");
export const SettingsIcon = createIcon(Settings2, "SettingsIcon");
export const ShieldIcon = createIcon(Shield, "ShieldIcon");
export const SparklesIcon = createIcon(Sparkles, "SparklesIcon");
export const SunMediumIcon = createIcon(SunMedium, "SunMediumIcon");
export const TrashIcon = createIcon(Trash2, "TrashIcon");
export const UserMinusIcon = createIcon(UserMinus, "UserMinusIcon");
export const UsersIcon = createIcon(Users, "UsersIcon");
export const XIcon = createIcon(X, "XIcon");
