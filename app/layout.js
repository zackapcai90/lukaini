import "./globals.css";

export const metadata = {
  title: "DFU Home Wound Care",
  description: "House-call wound dressing scheduling and records",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
