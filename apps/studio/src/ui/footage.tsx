import { FOOTAGE_LABEL, type FootageChoice, type FootageProfile } from "../pipeline/footage.ts";
import type { FootageStatus } from "../pipeline/studio.ts";
import { Chips } from "./controls";

const ORDER: FootageProfile[] = ["standard", "dlogm", "hlg", "pq", "applelog", "wide"];
const SHORT: Record<FootageProfile, string> = {
  standard: "Standard",
  dlogm: "D-Log M",
  hlg: "HDR HLG",
  pq: "HDR PQ",
  applelog: "Apple Log",
  wide: "BT.2020",
};
const HINT: Record<FootageProfile, string> = {
  standard: "Rec.709 as shot (Normal, Natural, GoPro Flat): no conversion",
  dlogm: "DJI Osmo / drone log, 10-bit",
  hlg: "HDR from iPhone, GoPro HDR, Osmo HLG",
  pq: "HDR10 / Dolby Vision base layer",
  applelog: "iPhone 15 Pro and later, log mode",
  wide: "Wide-gamut SDR",
};

/**
 * "Footage profile": what the camera recorded, converted to Rec.709 before
 * every tool. Auto follows the clip's tags and camera metadata.
 */
export function FootageField({ footage, onChange, disabled }: { footage: FootageStatus; onChange: (c: FootageChoice) => void; disabled?: boolean }) {
  const detected = footage.info?.detected ?? "standard";
  const items = [
    { id: "auto" as FootageChoice, label: `Auto · ${SHORT[detected]}`, hint: footage.info?.evidence.join("; ") || "From the clip's colour tags and camera metadata" },
    ...ORDER.map((id) => ({ id: id as FootageChoice, label: SHORT[id], hint: HINT[id] })),
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
