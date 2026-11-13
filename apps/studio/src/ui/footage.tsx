import { FOOTAGE_LABEL, type FootageChoice, type FootageProfile } from "../pipeline/footage.ts";
import type { FootageStatus } from "../pipeline/studio.ts";
import { Chips } from "./controls";

const ORDER: FootageProfile[] = ["standard", "dlogm", "gplog", "hlg", "pq", "applelog", "wide"];
export const FOOTAGE_SHORT: Record<FootageProfile, string> = {
  standard: "Standard",
  dlogm: "D-Log M",
  hlg: "HDR (iPhone, GoPro)",
  pq: "HDR10",
  applelog: "Apple Log",
  gplog: "GP-Log",
  wide: "Wide colour",
};
const HINT: Record<FootageProfile, string> = {
  standard: "Rec.709 as shot (Normal, Natural, GoPro Flat): no conversion",
  dlogm: "DJI Osmo / drone log, 10-bit",
  hlg: "HLG: HDR from iPhone, GoPro HDR, Osmo HLG",
  pq: "PQ: HDR10 / Dolby Vision base layer",
  applelog: "iPhone 15 Pro and later, log mode",
  gplog: "GoPro HERO11–13 Log (GP-Log), 10-bit",
  wide: "Wide-gamut SDR (BT.2020)",
};

/**
 * "Footage profile": what the camera recorded, converted to Rec.709 before
 * every tool. Auto follows the clip's tags and camera metadata.
 */
export function FootageField({ footage, onChange, disabled }: { footage: FootageStatus; onChange: (c: FootageChoice) => void; disabled?: boolean }) {
  const detected = footage.info?.detected ?? "standard";
  const items = [
    { id: "auto" as FootageChoice, label: `Auto · ${FOOTAGE_SHORT[detected]}`, hint: footage.info?.evidence.join("; ") || "From the clip's colour tags and camera metadata" },
    ...ORDER.map((id) => ({ id: id as FootageChoice, label: FOOTAGE_SHORT[id], hint: HINT[id] })),
  ];
  return (
    <div className="adv__field footage-field">
      <span className="adv__label">Footage profile <small>what the camera recorded</small></span>
      <Chips label="Footage profile" items={items} value={footage.choice} onChange={onChange} disabled={disabled} />
      <p className="adv__hint">
        {footage.active === "standard" ? "No conversion: the clip is treated as Rec.709." : `${FOOTAGE_LABEL[footage.active]} is converted to Rec.709 before dewarp, stabilise and colour.`}
        {footage.info?.evidence.length ? ` Detected from: ${footage.info.evidence.join("; ")}.` : ""}
        {footage.note && footage.note.includes("browser") ? " This browser converts HDR itself on one path, so the app's tone mapping is skipped there." : ""}
      </p>
    </div>
  );
}
