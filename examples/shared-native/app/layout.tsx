import './style.css';
export const metadata = {title: 'Shared runway · next-scriptc'};
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="en"><body><header>next-scriptc / Shared runway</header>{children}</body></html>;
}
