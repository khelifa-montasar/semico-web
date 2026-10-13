import logoSrc from "../../assets/semico1.png";

export function SemicoLogo({ height = 32 }: { height?: number }) {
  return (
    <img
      src={logoSrc}
      alt="Semico"
      style={{ height, width: "auto", objectFit: "contain", display: "block" }}
      draggable={false}
    />
  );
}
