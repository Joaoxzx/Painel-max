import './globals.css';

export const metadata = { title: 'Do Geovani • Pedidos' };

// Aplica o tema salvo antes da primeira pintura, evitando o "piscar" do modo claro.
const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem('theme')==='dark'?'dark':'light'}catch{}`;

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
