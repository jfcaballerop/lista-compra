import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Item = { id: string; name: string; purchased: number; created_at: string; purchased_at: string | null };
type Suggestion = { id: string; name: string };
type AuthState = 'loading' | 'logged-out' | 'logged-in';

type IconName = 'cart' | 'plus' | 'check' | 'trash' | 'search' | 'logout' | 'bag' | 'x' | 'lock' | 'sparkles' | 'wifi';

function Icon({ name, size = 22, stroke = 2 }: { name: IconName; size?: number; stroke?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    cart: <><path d="M3 3h2l2 12h12l2-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></>,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    trash: <><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v5M14 11v5" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M15 8l4 4-4 4M8 12h11" /></>,
    bag: <><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M9 9V5a3 3 0 0 1 6 0v4"/></>,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    sparkles: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3ZM19 16l.6 1.4L21 18l-1.4.6L19 20l-.6-1.4L17 18l1.4-.6L19 16Z" /></>,
    wifi: <><path d="M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0M9 17a4 4 0 0 1 6 0"/><circle cx="12" cy="21" r=".5"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

async function api<T>(url: string, opts: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...opts,
      headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...opts.headers },
    });
  } catch {
    throw new Error('Sin conexión. Comprueba Internet e inténtalo de nuevo.');
  }
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    const ex = new Error(result.error || 'No se ha podido completar la operación.');
    if (response.status === 401) ex.name = 'UnauthorizedError';
    throw ex;
  }
  return result as T;
}

function SupermarketSearch({ product, onClose }: { product: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, []);

  function close() {
    dialogRef.current?.close();
    onClose();
  }

  const query = encodeURIComponent(product);
  return <dialog ref={dialogRef} className="supermarket-dialog" aria-labelledby="supermarket-title" aria-describedby="supermarket-description"
    onCancel={event => { event.preventDefault(); close(); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
    <div className="supermarket-heading">
      <h2 id="supermarket-title">Elige supermercado</h2>
      <button type="button" className="icon-action" onClick={close} aria-label="Cerrar selector de supermercado"><Icon name="x" size={20} /></button>
    </div>
    <p id="supermarket-description">Buscar «{product}» en una nueva pestaña.</p>
    <div className="supermarket-options">
      <a href={`https://tienda.mercadona.es/search-results?query=${query}`} target="_blank" rel="noopener noreferrer">Mercadona <Icon name="search" size={20} /></a>
      <a href={`https://supermercado.froiz.com/?q=${query}`} target="_blank" rel="noopener noreferrer">Froiz <Icon name="search" size={20} /></a>
      <a href={`https://www.lidl.es/q/search?q=${query}`} target="_blank" rel="noopener noreferrer">Lidl <Icon name="search" size={20} /></a>
      <a href={`https://www.aldi.es/busqueda.html?query=${query}`} target="_blank" rel="noopener noreferrer">Aldi <Icon name="search" size={20} /></a>
    </div>
  </dialog>;
}

function App() {
  const [auth, setAuth] = useState<AuthState>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [invitation, setInvitation] = useState('');
  const [registering, setRegistering] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [lookupProduct, setLookupProduct] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRequest = useRef(0);

  const handleError = useCallback((err: unknown) => {
    if (err instanceof Error && err.name === 'UnauthorizedError') {
      searchRequest.current++;
      setAuth('logged-out');
      setItems([]);
      setLookupProduct(null);
      setCurrentUser('');
      setQuery('');
      setSuggestions([]);
      setSuggestionsOpen(false);
      setMessage('La sesión ha caducado. Vuelve a entrar.');
      return;
    }
    setMessage(err instanceof Error ? err.message : 'Algo ha fallado.');
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const response = await api<{ items: Item[] }>('/api/items');
      setItems(response.items);
    } catch (err) { handleError(err); }
    finally { setInitialLoading(false); }
  }, [handleError]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await api<{ authenticated: boolean; username?: string }>('/api/session');
        if (!active) return;
        setCurrentUser(response.username ?? '');
        setAuth(response.authenticated ? 'logged-in' : 'logged-out');
        if (response.authenticated) await loadItems();
      } catch (err) {
        if (active) {
          setAuth('logged-out');
          handleError(err);
        }
      }
    })();
    return () => { active = false; };
  }, [loadItems, handleError]);

  useEffect(() => {
    const term = query.trim();
    const requestNo = ++searchRequest.current;
    if (auth !== 'logged-in' || term.length < 3) { setSuggestions([]); setSuggestionsOpen(false); return; }
    const timer = setTimeout(async () => {
      try {
        const result = await api<{ suggestions: Suggestion[] }>(`/api/suggestions?q=${encodeURIComponent(term)}`);
        if (requestNo === searchRequest.current) {
          setSuggestions(result.suggestions);
          setSuggestionsOpen(true);
        }
      } catch (err) {
        if (requestNo === searchRequest.current) { setSuggestions([]); handleError(err); }
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [query, auth, handleError]);

  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!username.trim() || !password || working) return;
    setWorking(true);
    setMessage(null);
    try {
      const response = await api<{ authenticated: boolean; username: string }>(
        registering ? '/api/register' : '/api/login',
        { method: 'POST', body: JSON.stringify({ username, password, ...(registering ? { invitation } : {}) }) },
      );
      setPassword('');
      setInvitation('');
      setCurrentUser(response.username);
      setAuth('logged-in');
      await loadItems();
    } catch (err) { setMessage(err instanceof Error ? err.message : 'No se ha podido iniciar sesión.'); }
    finally { setWorking(false); }
  }

  async function logout() {
    try {
      await api('/api/logout', { method: 'POST' });
      searchRequest.current++;
      setAuth('logged-out');
      setCurrentUser('');
      setItems([]);
      setLookupProduct(null);
      setQuery('');
      setSuggestions([]);
      setSuggestionsOpen(false);
    } catch (err) { handleError(err); }
  }

  async function addProduct(name: string) {
    const cleaned = name.trim().replace(/\s+/g, ' ');
    if (!cleaned || working) return;
    setWorking(true);
    setMessage(null);
    setSuggestionsOpen(false);
    try {
      const response = await api<{ items: Item[] }>('/api/items', { method: 'POST', body: JSON.stringify({ name: cleaned }) });
      setItems(response.items);
      setQuery('');
      setSuggestions([]);
      inputRef.current?.focus();
    } catch (err) { handleError(err); }
    finally { setWorking(false); }
  }

  async function toggle(item: Item) {
    if (busyItem || working) return;
    setBusyItem(item.id);
    setMessage(null);
    // Movimiento optimista: reacciona al toque inmediatamente.
    setItems(current => current.map(i => i.id === item.id ? { ...i, purchased: i.purchased ? 0 : 1 } : i));
    try {
      const response = await api<{ items: Item[] }>(`/api/items/${item.id}`, {
        method: 'PATCH', body: JSON.stringify({ purchased: !item.purchased }),
      });
      setItems(response.items);
    } catch (err) {
      setItems(current => current.map(i => i.id === item.id ? item : i));
      handleError(err);
    } finally { setBusyItem(null); }
  }

  async function remove(item: Item) {
    if (busyItem || working) return;
    if (!window.confirm(`¿Eliminar «${item.name}» de la lista?\n\nSeguirá disponible en el histórico.`)) return;
    setBusyItem(item.id);
    setMessage(null);
    try {
      const response = await api<{ items: Item[] }>(`/api/items/${item.id}`, { method: 'DELETE' });
      setItems(response.items);
    } catch (err) { handleError(err); }
    finally { setBusyItem(null); }
  }

  async function clearPurchased() {
    if (!purchased.length || working || busyItem) return;
    if (!window.confirm('¿Vaciar todos los productos comprados?\n\nEl histórico para autocompletar se conservará.')) return;
    setWorking(true);
    setMessage(null);
    try {
      const response = await api<{ items: Item[] }>('/api/items/purchased', { method: 'DELETE' });
      setItems(response.items);
    } catch (err) { handleError(err); }
    finally { setWorking(false); }
  }

  const pending = items.filter(item => !item.purchased);
  const purchased = items.filter(item => !!item.purchased);

  function renderItem(item: Item) {
    return <div className={`item ${item.purchased ? 'item--done' : ''}`} key={item.id}>
      <button
        type="button" className="item-main" onClick={() => toggle(item)}
        disabled={!!busyItem || working} aria-label={`${item.purchased ? 'Volver a pendientes' : 'Marcar como comprado'}: ${item.name}`}
        aria-pressed={!!item.purchased}
      >
        <span className="item-check">{item.purchased ? <Icon name="check" size={17} stroke={3} /> : null}</span>
        <span className="item-name">{item.name}</span>
      </button>
      <button
        type="button"
        className="icon-action product-lookup"
        onClick={() => setLookupProduct(item.name)}
        title={`Consultar ${item.name} en un supermercado`}
        aria-label={`Consultar el precio de ${item.name} en un supermercado`}
        aria-haspopup="dialog"
      >
        <Icon name="search" size={19} />
      </button>
      <button type="button" className="icon-action delete" title={`Eliminar ${item.name}`} aria-label={`Eliminar ${item.name}`} onClick={() => remove(item)} disabled={!!busyItem || working}>
        <Icon name="trash" size={19} />
      </button>
    </div>;
  }

  if (auth === 'loading') {
    return <div className="full-center"><div className="loading-spinner" /><p>Preparando tu lista…</p></div>;
  }

  if (auth === 'logged-out') {
    return <main className="login-page">
      <div className="login-card">
        <div className="hero-icon"><Icon name="bag" size={38} stroke={1.8} /></div>
        <div className="eyebrow">TU COMPRA, MÁS FÁCIL</div>
        <h1>Mi Lista<span>.</span></h1>
        <p className="login-subtitle">{registering ? 'Crea tu cuenta con un código de invitación.' : 'Entra para ver tu lista privada.'}</p>
        <form onSubmit={login} className="login-form">
          <label htmlFor="username">Usuario</label>
          <div className="input-with-icon"><input id="username" type="text" autoComplete="username" placeholder="Tu usuario" minLength={3} maxLength={32} value={username} onChange={e => setUsername(e.target.value)} required /></div>
          <label htmlFor="password">Contraseña</label>
          <div className="input-with-icon"><Icon name="lock" size={19}/><input id="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} placeholder="Tu contraseña" minLength={registering ? 12 : undefined} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} required /></div>
          {registering && <><label htmlFor="invitation">Código de invitación</label><div className="input-with-icon"><input id="invitation" type="password" autoComplete="off" placeholder="Código de invitación" value={invitation} onChange={e => setInvitation(e.target.value)} required /></div></>}
          <button className="primary-button" disabled={working} type="submit">{working ? 'Procesando…' : registering ? 'Crear cuenta' : 'Entrar en mi lista'} <span>→</span></button>
          <button className="auth-switch" type="button" disabled={working} onClick={() => { setRegistering(!registering); setMessage(null); setPassword(''); setInvitation(''); }}>{registering ? 'Ya tengo una cuenta' : 'Crear una cuenta con invitación'}</button>
        </form>
        {message && <div className="feedback" role="alert">{message}<button aria-label="Cerrar aviso" onClick={() => setMessage(null)}><Icon name="x" size={15} /></button></div>}
        <p className="private-note"><Icon name="lock" size={14}/> Tus productos se guardan de forma privada en Cloudflare.</p>
      </div>
    </main>;
  }

  return <div className="app-shell">
    <header className="header">
      <div className="brand">
        <div className="brand-icon"><Icon name="bag" size={23}/></div>
        <span>Mi Lista<span className="brand-dot">.</span></span>
        <svg className="brand-flag" role="img" aria-label="Bandera de España" width="24" height="16" viewBox="0 0 24 16">
          <path fill="#aa151b" d="M0 0h24v16H0z" />
          <path fill="#f1bf00" d="M0 4h24v8H0z" />
        </svg>
      </div>
      <div className="account-actions"><span>{currentUser}</span><button type="button" className="logout-button" onClick={logout} disabled={working || !!busyItem || initialLoading} title="Cerrar sesión" aria-label="Cerrar sesión"><Icon name="logout" size={20}/></button></div>
    </header>

    <main className="content">
      <div className="welcome">
        <div className="eyebrow"><Icon name="sparkles" size={15} /> TU LISTA DE SIEMPRE, MÁS INTELIGENTE</div>
        <h1>¿Qué necesitamos <span>comprar?</span></h1>
        <p>Apunta lo que falta. Nosotros recordamos lo de siempre.</p>
      </div>

      <section className="compose-card" aria-label="Añadir producto">
        <form className="compose-form" onSubmit={e => { e.preventDefault(); void addProduct(query); }}>
          <div className="entry-wrapper">
            <button type="button" className="entry-lookup" disabled={!query.trim() || working}
              onClick={() => setLookupProduct(query.trim())} title="Consultar antes de añadir"
              aria-label="Consultar el precio del producto escrito en un supermercado" aria-haspopup="dialog">
              <Icon name="search" size={21}/>
            </button>
            <input ref={inputRef} id="product-input" type="text" autoComplete="off" placeholder="Añadir producto (ej. leche)…" maxLength={80} value={query}
              onChange={e => setQuery(e.target.value)} onFocus={() => { if (suggestions.length && query.trim().length >= 3) setSuggestionsOpen(true); }}
              onKeyDown={e => { if (e.key === 'Escape') setSuggestionsOpen(false); }} />
            {query && <button className="clear-entry" type="button" aria-label="Borrar texto" onClick={() => { setQuery(''); setSuggestionsOpen(false); inputRef.current?.focus(); }}><Icon name="x" size={17}/></button>}
          </div>
          <button type="submit" className="add-button" disabled={!query.trim() || working} aria-label="Añadir producto"><Icon name="plus" size={23}/><span>Añadir</span></button>
        </form>
        {suggestionsOpen && suggestions.length > 0 && <div className="suggestions" aria-label="Sugerencias del histórico">
          <div className="suggest-title"><Icon name="sparkles" size={14}/> De tu histórico</div>
          {suggestions.map(s => <button type="button" className="suggest-option" key={s.id} onClick={() => addProduct(s.name)}><Icon name="search" size={16}/><span>{s.name}</span><Icon name="plus" size={16}/></button>)}
        </div>}
        <div className="tip"><Icon name="sparkles" size={16}/> Escribe <strong>3 letras</strong> y te sugerimos productos anteriores.</div>
      </section>

      <div className="summary">
        <div><span className="summary-caption">POR COMPRAR</span><div className="summary-value">{pending.length}<span> productos</span></div></div>
        <div className="summary-divider"/>
        <div><span className="summary-caption">YA EN LA CESTA</span><div className="summary-value summary-value--subtle">{purchased.length}<span> comprados</span></div></div>
      </div>

      {message && <div className="feedback" role="alert">{message}<button aria-label="Cerrar aviso" onClick={() => setMessage(null)}><Icon name="x" size={15}/></button></div>}

      <section className="list-section" aria-labelledby="pending-title">
        <div className="section-heading"><div className="section-heading-title"><span className="section-dot"/><h2 id="pending-title">Por comprar</h2><span className="count-pill">{pending.length}</span></div><span className="section-hint">Toca para marcar</span></div>
        <div className="item-list">
          {initialLoading ? <div className="empty"><div className="loading-spinner"/> Cargando lista…</div> : pending.length ? pending.map(renderItem) : <div className="empty-state"><div className="empty-illustration"><Icon name="check" size={28}/></div><h3>¡Todo listo!</h3><p>No hay productos pendientes. Añade algo arriba para empezar.</p></div>}
        </div>
      </section>

      <section className="list-section bought-section" aria-labelledby="bought-title">
        <div className="section-heading"><div className="section-heading-title"><span className="section-dot section-dot--done"/><h2 id="bought-title">Comprados</h2><span className="count-pill muted">{purchased.length}</span></div>{purchased.length > 0 && <button type="button" className="clear-bought" onClick={clearPurchased} disabled={working || !!busyItem}><Icon name="trash" size={16}/> Vaciar</button>}</div>
        <div className="item-list">{purchased.length ? purchased.map(renderItem) : <div className="bought-empty">Los productos que marques aparecerán aquí, tachados y separados de los pendientes.</div>}</div>
      </section>
      <div className="bottom-note"><Icon name="wifi" size={16}/> Necesitas conexión para sincronizar los cambios.</div>
    </main>
    {lookupProduct !== null && <SupermarketSearch product={lookupProduct} onClose={() => setLookupProduct(null)} />}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
