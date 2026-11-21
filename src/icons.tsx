// Google Material Symbols (Outlined, weight 400; Apache-2.0), bundled as SVG so the app needs no network.
// Exported under descriptive names; only the icons imported here end up in the build.
import type { CSSProperties, ReactElement } from "react";
import monitoring from "@material-symbols/svg-400/outlined/monitoring.svg?raw";
import arrowBack from "@material-symbols/svg-400/outlined/arrow_back.svg?raw";
import arrowForward from "@material-symbols/svg-400/outlined/arrow_forward.svg?raw";
import chevronRight from "@material-symbols/svg-400/outlined/chevron_right.svg?raw";
import schedule from "@material-symbols/svg-400/outlined/schedule.svg?raw";
import cloud from "@material-symbols/svg-400/outlined/cloud.svg?raw";
import contentCopy from "@material-symbols/svg-400/outlined/content_copy.svg?raw";
import database from "@material-symbols/svg-400/outlined/database.svg?raw";
import download from "@material-symbols/svg-400/outlined/download.svg?raw";
import openInNew from "@material-symbols/svg-400/outlined/open_in_new.svg?raw";
import visibility from "@material-symbols/svg-400/outlined/visibility.svg?raw";
import draft from "@material-symbols/svg-400/outlined/draft.svg?raw";
import description from "@material-symbols/svg-400/outlined/description.svg?raw";
import folder from "@material-symbols/svg-400/outlined/folder.svg?raw";
import driveFileMove from "@material-symbols/svg-400/outlined/drive_file_move.svg?raw";
import folderOpen from "@material-symbols/svg-400/outlined/folder_open.svg?raw";
import createNewFolder from "@material-symbols/svg-400/outlined/create_new_folder.svg?raw";
import hardDrive from "@material-symbols/svg-400/outlined/hard_drive.svg?raw";
import stacks from "@material-symbols/svg-400/outlined/stacks.svg?raw";
import dashboard from "@material-symbols/svg-400/outlined/dashboard.svg?raw";
import link from "@material-symbols/svg-400/outlined/link.svg?raw";
import progressActivity from "@material-symbols/svg-400/outlined/progress_activity.svg?raw";
import edit from "@material-symbols/svg-400/outlined/edit.svg?raw";
import playArrow from "@material-symbols/svg-400/outlined/play_arrow.svg?raw";
import add from "@material-symbols/svg-400/outlined/add.svg?raw";
import sync from "@material-symbols/svg-400/outlined/sync.svg?raw";
import refresh from "@material-symbols/svg-400/outlined/refresh.svg?raw";
import search from "@material-symbols/svg-400/outlined/search.svg?raw";
import dns from "@material-symbols/svg-400/outlined/dns.svg?raw";
import settings from "@material-symbols/svg-400/outlined/settings.svg?raw";
import del from "@material-symbols/svg-400/outlined/delete.svg?raw";
import upload from "@material-symbols/svg-400/outlined/upload.svg?raw";
import close from "@material-symbols/svg-400/outlined/close.svg?raw";
import checkCircle from "@material-symbols/svg-400/outlined/check_circle.svg?raw";

export type IconProps = { size?: number; color?: string; className?: string; style?: CSSProperties; strokeWidth?: number };
export type Icon = (props: IconProps) => ReactElement;

function make(svg: string): Icon {
  const d = /\sd="([^"]+)"/.exec(svg)?.[1] ?? "";
  // strokeWidth is accepted for call-site compatibility; Material Symbols are filled shapes.
  return ({ size = 20, color = "currentColor", className, style }) => (
    <svg viewBox="0 -960 960 960" width={size} height={size} fill={color} className={className} style={{ flex: "none", ...style }} aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

export const Activity = make(monitoring);
export const ArrowLeft = make(arrowBack);
export const ArrowRight = make(arrowForward);
export const ChevronRight = make(chevronRight);
export const CheckCircle = make(checkCircle);
export const Clock = make(schedule);
export const Cloud = make(cloud);
export const Copy = make(contentCopy);
export const Database = make(database);
export const Download = make(download);
export const ExternalLink = make(openInNew);
export const Eye = make(visibility);
export const File = make(draft);
export const FileText = make(description);
export const Folder = make(folder);
export const FolderInput = make(driveFileMove);
export const FolderOpen = make(folderOpen);
export const FolderPlus = make(createNewFolder);
export const HardDrive = make(hardDrive);
export const Layers = make(stacks);
export const LayoutDashboard = make(dashboard);
export const Link = make(link);
export const Loader2 = make(progressActivity);
export const Pencil = make(edit);
export const Play = make(playArrow);
export const Plus = make(add);
export const RefreshCw = make(sync);
export const RotateCw = make(refresh);
export const Search = make(search);
export const Server = make(dns);
export const Settings = make(settings);
export const Trash2 = make(del);
export const Upload = make(upload);
export const X = make(close);
