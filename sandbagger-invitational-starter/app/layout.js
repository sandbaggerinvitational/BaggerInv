import "./globals.css";

export const metadata = {
  title: "Sandbagger Invitational",
  description: "Official website of the Sandbagger Invitational.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
