import { Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Library from './pages/Library';
import Browse from './pages/Browse';
import MangaDetail from './pages/MangaDetail';
import Reader from './pages/Reader';
import History from './pages/History';
import Settings from './pages/Settings';

export default function App(): JSX.Element {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/browse/:sourceId" element={<Browse />} />
          <Route path="/manga/:sourceId/:mangaId" element={<MangaDetail />} />
          <Route path="/read/:sourceId/:mangaId/:chapterId" element={<Reader />} />
        </Routes>
      </div>
    </div>
  );
}
