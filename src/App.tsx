import { FormEvent, useEffect, useMemo, useState } from 'react';
import asset1 from './assets/asset-1.jpg';
import asset2 from './assets/asset-2.jpg';
import asset3 from './assets/asset-3.jpg';
import asset4 from './assets/asset-4.jpg';
import asset5 from './assets/asset-5.jpg';
import asset6 from './assets/asset-6.jpg';
import './style.css';

type Verdict = 'ai' | 'authentic';
type Asset = { id: string; title: string; source_label: string; category: string; image_url: string; status: string; created_at?: string };
type Vote = { asset_id: string; voter_name: string; verdict: Verdict };
type Evidence = { asset_id: string; author: string; verdict: Verdict; body: string; created_at?: string };
type Session = { access_token: string; user?: { email?: string; user_metadata?: { display_name?: string } } } | null;

const SUPA_URL = 'https://kphhtzsmsuzbaeqosgii.supabase.co';
const SUPA_KEY = 'sb_publishable_KhBtyPn65x3wUfuvhCLokw_yoBWIsNp';
const REST = `${SUPA_URL}/rest/v1/`;
const AUTH = `${SUPA_URL}/auth/v1/`;
const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' };
const bundledImages = [asset1, asset2, asset3, asset4, asset5, asset6];
const filters: [string, string][] = [['all', 'All'], ['trending', 'Trending'], ['needs', 'Needs Votes'], ['anime', 'Anime'], ['gaming', 'Gaming'], ['tv', 'TV/Film'], ['resolved', 'Resolved']];

const memoryStore = new Map<string, string>();
function storageGet(key: string) {
    try { return window.localStorage.getItem(key); } catch { return memoryStore.get(key) || null; }
}
function storageSet(key: string, value: string) {
    memoryStore.set(key, value);
    try { window.localStorage.setItem(key, value); } catch { /* Hosted preview can be sandboxed. */ }
}
function storageRemove(key: string) {
    memoryStore.delete(key);
    try { window.localStorage.removeItem(key); } catch { /* Hosted preview can be sandboxed. */ }
}
function storedSession(): Session {
    try { return JSON.parse(storageGet('aiornot_session') || 'null'); } catch { return null; }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(REST + path, { cache: 'no-store', ...options, headers: { ...headers, ...(options.headers || {}) } });
    const text = await response.text();
    if (!response.ok) throw new Error(text);
    return (text ? JSON.parse(text) : []) as T;
}

function imageFor(asset: Asset, index: number) {
    if (asset.image_url?.startsWith('data:')) return asset.image_url;
    return bundledImages[index % bundledImages.length];
}

function readFile(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

export function App() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [votes, setVotes] = useState<Vote[]>([]);
    const [evidence, setEvidence] = useState<Evidence[]>([]);
    const [filter, setFilter] = useState('all');
    const [current, setCurrent] = useState<Asset | null>(null);
    const [session, setSession] = useState<Session>(() => storedSession());
    const [pro, setPro] = useState(storageGet('aiornot_pro') === 'yes');
    const [status, setStatus] = useState('Loading shared community data...');
    const [toast, setToast] = useState('');
    const [authOpen, setAuthOpen] = useState(false);
    const [proOpen, setProOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    async function load() {
        try {
            const freshness = encodeURIComponent(new Date().toISOString());
            const [nextAssets, nextVotes, nextEvidence] = await Promise.all([
                api<Asset[]>(`assets?select=*&created_at=lte.${freshness}&order=created_at.asc`),
                api<Vote[]>(`votes?select=*&created_at=lte.${freshness}`),
                api<Evidence[]>(`evidence?select=*&created_at=lte.${freshness}&order=created_at.desc`),
            ]);
            setAssets(nextAssets);
            setVotes(nextVotes);
            setEvidence(nextEvidence);
            setStatus(`Live shared database: ${nextAssets.length} assets, ${nextVotes.length} votes`);
        } catch (error) {
            setStatus(`Database error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    useEffect(() => { void load(); }, []);
    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(''), 4200);
        return () => window.clearTimeout(timer);
    }, [toast]);

    function counts(assetId: string) {
        const assetVotes = votes.filter((vote) => vote.asset_id === assetId);
        const auth = assetVotes.filter((vote) => vote.verdict === 'authentic').length;
        return { total: assetVotes.length, auth, ai: assetVotes.length - auth, pct: assetVotes.length ? Math.round((auth * 100) / assetVotes.length) : 0 };
    }

    const visibleAssets = useMemo(() => {
        const next = [...assets];
        if (filter === 'trending') next.sort((a, b) => counts(b.id).total - counts(a.id).total);
        else if (filter === 'needs') next.sort((a, b) => counts(a.id).total - counts(b.id).total);
        else if (filter === 'resolved') return next.filter((asset) => asset.status === 'resolved');
        else if (['anime', 'gaming', 'tv'].includes(filter)) return next.filter((asset) => asset.category === filter);
        return next;
    }, [assets, votes, filter]);

    const leaders = useMemo(() => {
        const byName = new Map<string, { votes: number; auth: number }>();
        votes.forEach((vote) => {
            const row = byName.get(vote.voter_name) || { votes: 0, auth: 0 };
            row.votes += 1;
            if (vote.verdict === 'authentic') row.auth += 1;
            byName.set(vote.voter_name, row);
        });
        return [...byName.entries()].sort((a, b) => b[1].votes - a[1].votes).slice(0, 8);
    }, [votes]);

    function voterName() {
        const name = session?.user?.user_metadata?.display_name || session?.user?.email || storageGet('aiornot_name') || 'Community voter';
        storageSet('aiornot_name', name);
        return name.slice(0, 80);
    }

    async function castVote(assetId: string, verdict: Verdict) {
        setBusy(true);
        try {
            await api('votes', { method: 'POST', body: JSON.stringify({ asset_id: assetId, voter_name: voterName(), verdict }) });
            await load();
            setToast('Vote saved to the shared database');
        } catch (error) { setToast(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
    }

    async function postEvidence(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!current) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        setBusy(true);
        try {
            await api('evidence', { method: 'POST', body: JSON.stringify({ asset_id: current.id, author: data.get('author'), verdict: data.get('verdict'), body: data.get('body') }) });
            form.reset();
            await load();
            setToast('Evidence posted to the shared debate');
        } catch (error) { setToast(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
    }

    async function uploadAsset(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const file = data.get('image');
        if (!(file instanceof File) || !file.size) return;
        if (file.size > 900000) { setToast('Please choose an image under 900KB for this demo'); return; }
        setBusy(true);
        try {
            const image = await readFile(file);
            await api('assets', { method: 'POST', body: JSON.stringify({ title: data.get('title'), source_label: String(data.get('source_label')).toUpperCase(), category: data.get('category'), image_url: image, status: 'open' }) });
            form.reset();
            await load();
            setToast('Asset uploaded to the shared queue');
        } catch (error) { setToast(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
    }

    async function requestAudit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        setBusy(true);
        try {
            await api('audit_requests', { method: 'POST', body: JSON.stringify({ company: data.get('company'), email: data.get('email'), asset_count: Number(data.get('asset_count')), notes: data.get('notes') }) });
            form.reset();
            setToast('Audit request saved. The paid report workflow is ready for Stripe.');
        } catch (error) { setToast(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
    }

    async function activatePro(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const email = new FormData(form).get('email');
        setBusy(true);
        try {
            await api('subscribers', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ email, plan: 'pro', status: 'demo_active' }) });
            setPro(true);
            storageSet('aiornot_pro', 'yes');
            setProOpen(false);
            setToast('Demo Pro activated. No payment was charged.');
        } catch (error) { setToast(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
    }

    async function auth(mode: 'signup' | 'signin', form: HTMLFormElement) {
        const data = new FormData(form);
        setBusy(true);
        try {
            const url = AUTH + (mode === 'signup' ? 'signup' : 'token?grant_type=password');
            const body = mode === 'signup' ? { email: data.get('email'), password: data.get('password'), data: { display_name: data.get('name') } } : { email: data.get('email'), password: data.get('password') };
            const response = await fetch(url, { method: 'POST', headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error_description || result.msg || result.message || 'Auth failed');
            if (result.access_token) {
                const next = { access_token: result.access_token, user: result.user };
                setSession(next);
                storageSet('aiornot_session', JSON.stringify(next));
                setAuthOpen(false);
                setToast('Signed in');
            } else setToast('Account created. Check your email to confirm, then sign in.');
        } catch (error) { setToast(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
    }

    function downloadReport() {
        const lines = ['AIOrNot demo verification report', `Generated: ${new Date().toLocaleString()}`, '', `Shared assets: ${assets.length}`, `Total votes: ${votes.length}`, '', 'Asset summary:', ...assets.map((asset) => { const c = counts(asset.id); return `- ${asset.title}: ${c.pct}% authentic, ${c.total} votes`; }), '', 'Monetization note: ad serving and Stripe checkout are demo placeholders until approved accounts are connected.'];
        const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'AIOrNot-verification-report.txt';
        link.click();
        URL.revokeObjectURL(url);
    }

    const userName = session?.user?.user_metadata?.display_name || session?.user?.email;
    const currentCounts = current ? counts(current.id) : null;
    const currentEvidence = current ? evidence.filter((item) => item.asset_id === current.id) : [];

    return <div className="wrap">
        <header className="top">
            <div className="brand">AI<span>OrNot</span></div>
            <div className="topactions">
                <span className="small">{userName ? `Signed in as ${userName}` : ''}</span>
                <button className="btn ghost" type="button" onClick={() => document.getElementById('upload-panel')?.scrollIntoView({ behavior: 'smooth' })}>Upload asset</button>
                <button className="btn" type="button" onClick={() => { if (session) { setSession(null); storageRemove('aiornot_session'); } else setAuthOpen(true); }}>{session ? 'Sign out' : 'Sign in'}</button>
                <button className="btn primary" type="button" onClick={() => setProOpen(true)}>Go Pro</button>
            </div>
        </header>

        <section className="hero">
            <h1>Is it hand-made, or <span className="grad">machine-made?</span></h1>
            <p>Fans of games, anime and film inspect the pixels together. Cast your vote, defend it with evidence, and watch the verdict settle.</p>
        </section>

        <nav className="filters" aria-label="Asset filters">{filters.map(([key, label]) => <button key={key} className={filter === key ? 'pill active' : 'pill'} type="button" onClick={() => setFilter(key)}>{label}</button>)}</nav>
        <div className="status" aria-live="polite">{status}</div>

        <main className="grid">
            {visibleAssets.map((asset, index) => {
                const c = counts(asset.id);
                const ai = c.ai >= c.auth;
                return <article className="card" key={asset.id}>
                    <div className="media">
                        <img src={imageFor(asset, index)} alt={asset.title} />
                        <span className={ai ? 'badge ai' : 'badge auth'}>{ai ? 'AI-Generated' : 'Authentic'}</span>
                    </div>
                    <div className="body">
                        <div className="source">{asset.source_label}</div>
                        <div className="title">{asset.title}</div>
                        <div className="tags">{(ai ? ['Anatomy Check', 'Pattern Melt', 'Background Warp'] : ['Brush Texture', 'Consistent Geometry', 'Source Match']).map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
                        <div className="bar"><i style={{ width: `${c.pct}%` }} /></div>
                        <div className="meta"><span>{c.pct}% Authentic</span><span>{c.total} votes</span></div>
                        <div className="votes">
                            <button className="btn good" disabled={busy} type="button" onClick={() => void castVote(asset.id, 'authentic')}>Authentic</button>
                            <button className="btn bad" disabled={busy} type="button" onClick={() => void castVote(asset.id, 'ai')}>AI-Generated</button>
                        </div>
                        <button className="btn ghost evidenceBtn" type="button" onClick={() => setCurrent(asset)}>{evidence.filter((item) => item.asset_id === asset.id).length} evidence comments</button>
                    </div>
                </article>;
            })}
            {!pro && <div className="ad"><div><strong>Sponsored placement</strong><p>Demo ad slot for the free tier. Connect an approved ad network to serve real ads.</p></div><button className="btn primary" type="button" onClick={() => setProOpen(true)}>Go Pro</button></div>}
        </main>

        <section className="section twocol">
            <div className="panel">
                <h2>Community leaderboard</h2>
                <p>Early voters build reputation for accurate, evidence-backed calls.</p>
                <div>{leaders.length ? leaders.map(([name, row], index) => <div className="leaderRow" key={name}><div><span className="rank">{index + 1}</span><b>{name}</b></div><span>{row.votes} votes · {Math.round((row.auth * 100) / row.votes)}% auth</span></div>) : <p>No votes yet.</p>}</div>
            </div>
            <div className="panel">
                <h2>Pro membership</h2>
                <p>Remove ads, save private watchlists, and unlock advanced audit exports.</p>
                {!pro && <div className="ad"><div><strong>Ad slot</strong><p>Free tier placement. AdSense is not connected yet, so this is a clearly marked demo slot.</p></div><button className="btn primary" type="button" onClick={() => setProOpen(true)}>Remove ads</button></div>}
                <br /><button className="btn primary" type="button" onClick={downloadReport}>Download demo verification report</button>
                <p className="small">Payments are not charged. Stripe is waiting for account credentials.</p>
            </div>
        </section>

        <section className="section twocol">
            <div className="panel">
                <h2>Studio batch audits</h2>
                <p>Studios and marketplaces can request a batch review and verification report.</p>
                <form className="form" onSubmit={requestAudit}>
                    <input name="company" placeholder="Studio or marketplace" required />
                    <input name="email" type="email" placeholder="Work email" required />
                    <input name="asset_count" type="number" min="1" max="10000" defaultValue="25" required />
                    <textarea name="notes" placeholder="What should reviewers look for?" />
                    <button className="btn primary" disabled={busy}>Request audit</button>
                </form>
            </div>
            <div className="panel" id="upload-panel">
                <h2>Upload for review</h2>
                <p>Add a visual asset to the shared queue. Images up to about 700KB work best.</p>
                <form className="form" onSubmit={uploadAsset}>
                    <input name="title" placeholder="Asset title" required />
                    <input name="source_label" placeholder="Source label (game, anime, show)" required />
                    <select name="category"><option value="anime">Anime</option><option value="gaming">Gaming</option><option value="tv">TV/Film</option></select>
                    <input name="image" type="file" accept="image/*" required />
                    <button className="btn primary" disabled={busy}>Upload to community queue</button>
                </form>
            </div>
        </section>

        {current && <div className="modalBack open"><div className="modal"><div className="modalGrid">
            <div className="modalImg"><img src={imageFor(current, assets.findIndex((asset) => asset.id === current.id))} alt={current.title} /></div>
            <div className="modalBody">
                <button className="btn ghost close" type="button" onClick={() => setCurrent(null)}>Close</button>
                <div className="source">{current.source_label}</div><h2>{current.title}</h2>
                <div><b>{currentCounts?.pct}% Authentic</b> · {currentCounts?.total} votes</div>
                <div className="bar"><i style={{ width: `${currentCounts?.pct || 0}%` }} /></div>
                <div className="votes"><button className="btn good" disabled={busy} type="button" onClick={() => void castVote(current.id, 'authentic')}>Authentic</button><button className="btn bad" disabled={busy} type="button" onClick={() => void castVote(current.id, 'ai')}>AI-Generated</button></div>
                <h3>Community debate</h3>
                <div>{currentEvidence.length ? currentEvidence.map((item, index) => <div className="comment" key={`${item.created_at}-${index}`}><b>{item.author}</b> <span className="small">supports {item.verdict === 'ai' ? 'AI-generated' : 'authentic'}</span><br />{item.body}</div>) : <p className="small">No evidence yet. Start the debate.</p>}</div>
                <form className="form" onSubmit={postEvidence}><input name="author" placeholder="Your name" required /><select name="verdict"><option value="ai">Supports AI-generated</option><option value="authentic">Supports authentic</option></select><textarea name="body" placeholder="What visual evidence did you find?" required /><button className="btn primary" disabled={busy}>Post evidence</button></form>
            </div>
        </div></div></div>}

        {authOpen && <div className="modalBack open"><div className="modal" style={{ maxWidth: 470 }}><div className="modalBody">
            <button className="btn ghost close" type="button" onClick={() => setAuthOpen(false)}>Close</button><h2>Account</h2><p className="small">Real Supabase email/password account. New accounts may need email confirmation.</p>
            <form className="form" onSubmit={(event) => event.preventDefault()}><input name="name" placeholder="Display name" /><input name="email" type="email" placeholder="Email" required /><input name="password" type="password" minLength={6} placeholder="Password" required /><button className="btn primary" disabled={busy} type="button" onClick={(event) => void auth('signup', event.currentTarget.form!)}>Create account</button><button className="btn" disabled={busy} type="button" onClick={(event) => void auth('signin', event.currentTarget.form!)}>Sign in</button></form>
        </div></div></div>}

        {proOpen && <div className="modalBack open"><div className="modal" style={{ maxWidth: 470 }}><div className="modalBody">
            <button className="btn ghost close" type="button" onClick={() => setProOpen(false)}>Close</button><h2>AIOrNot Pro</h2><p>$6/month demo checkout. No card is charged because Stripe credentials have not been provided.</p>
            <form className="form" onSubmit={activatePro}><input name="email" type="email" placeholder="Email for Pro receipt" required /><button className="btn primary" disabled={busy}>Activate demo Pro</button></form>
        </div></div></div>}

        <div className="toast" style={{ display: toast ? 'block' : 'none' }}>{toast}</div>
    </div>;
}
