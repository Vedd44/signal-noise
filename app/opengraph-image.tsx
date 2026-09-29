import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630
};

export const alt = "Signal > Noise — What matters now.";

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          background: "#f7f6f2",
          color: "#1d1d1b",
          padding: "64px 72px",
          flexDirection: "column",
          justifyContent: "space-between",
          fontFamily: "Georgia, serif"
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            textTransform: "uppercase",
            color: "#1d1d1b"
          }}
        >
          Signal&nbsp;<span style={{ color: "#77573f", fontWeight: 400 }}>&gt;</span>&nbsp;Noise
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
          <div
            style={{
              fontSize: 68,
              lineHeight: 0.98,
              letterSpacing: "-0.06em",
              fontWeight: 700
            }}
          >
            What matters now.
          </div>
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.4,
              color: "#484844",
              fontFamily: "Helvetica, Arial, sans-serif"
            }}
          >
            AI, media, product and consumer tech — minus the noise.
          </div>
        </div>
      </div>
    ),
    size
  );
}
