import AssetImage from "./AssetImage";
import { playerPhoto } from "../lib/asset-paths";

export function playerAvatarInitials(name) {
  return String(name || "SBI").trim().split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "SBI";
}

export function playerAvatarPhoto(player, filename = "") {
  if (filename) return String(filename).trim();
  if (!player || typeof player !== "object") return "";
  return String(player.photo || player["Photo Filename"] || "").trim();
}

export default function PlayerAvatar({ player, filename = "", src = "", name = "", alt = "", className, fallbackClassName, ...imageProps }) {
  const playerName = name || player?.name || player?.["Display Name"] || "Player";
  const resolvedSrc = src || playerPhoto(playerAvatarPhoto(player, filename));
  return <AssetImage {...imageProps} src={resolvedSrc} alt={alt} className={className} fallbackClassName={fallbackClassName} fallback={playerAvatarInitials(playerName)} inferFallback={false} />;
}
