import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight, ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown,
  Heart, Instagram, Mail, MapPin, Menu, Minus, PackageCheck, Phone,
  Plus, Search, ShoppingBag, SlidersHorizontal, Sparkles, Trash2, Upload, X,
} from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://127.0.0.1:8011" : "https://classycollection-1.onrender.com")).replace(/\/$/, "");
const categoryFallback = ["Girls Clothes", "Jewellery", "Nails", "Makeup"];
const emptyProduct = { name: "", category: "Girls Clothes", price: 1, style: "", description: "", image: "", stock: 0, featured: false, discountPercent: 0, offerLabel: "", options: "" };

function currency(value) {
  return new Intl.NumberFormat("en-NP", { style: "currency", currency: "NPR", maximumFractionDigits: 0 }).format(value);
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Something went wrong" }));
    throw new Error(error.detail || "Something went wrong");
  }
  return response.json();
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function App() {
  if (window.location.pathname.replace(/\/$/, "") === "/admin") return <AdminPage />;
  return <Storefront />;
}

function Storefront() {
  const [site, setSite] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(categoryFallback);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("featured");
  const [selectedOptionFilter, setSelectedOptionFilter] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [selectedOptions, setSelectedOptions] = useState({});
  const [cart, setCart] = useState({});
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", city: "", note: "" });
  const [paymentMethod, setPaymentMethod] = useState("eSewa");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [paymentProof, setPaymentProof] = useState("");
  const [proofName, setProofName] = useState("");
  const [notice, setNotice] = useState("");
  const [orderConfirmation, setOrderConfirmation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);

  async function loadStore() {
    setLoading(true);
    setNotice("");
    try {
      const payload = await api("/api/site");
      setSite(payload.site);
      setProducts(payload.products);
      setCategories(payload.categories?.length ? payload.categories : categoryFallback);
    } catch {
      setNotice("We couldn't connect to the shop. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadStore(); }, []);

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = products.filter((product) => {
      const price = Math.round(product.price * (100 - (product.discountPercent || 0)) / 100);
      const matchesCategory = selectedCategory === "All" || product.category === selectedCategory;
      const matchesQuery = !query || [product.name, product.category, product.style, product.description, product.offerLabel, product.options].join(" ").toLowerCase().includes(query);
      const options = (product.options || "").split(",").map((value) => value.trim());
      const matchesOption = !selectedOptionFilter || options.includes(selectedOptionFilter);
      return matchesCategory && matchesQuery && matchesOption && (!onlyInStock || product.stock > 0) && (!minPrice || price >= Number(minPrice)) && (!maxPrice || price <= Number(maxPrice));
    });
    return filtered.sort((a, b) => sortOrder === "price-low" ? a.price * (100 - (a.discountPercent || 0)) - b.price * (100 - (b.discountPercent || 0)) : sortOrder === "price-high" ? b.price * (100 - (b.discountPercent || 0)) - a.price * (100 - (a.discountPercent || 0)) : sortOrder === "name" ? a.name.localeCompare(b.name) : Number(b.featured) - Number(a.featured));
  }, [products, selectedCategory, searchQuery, sortOrder, selectedOptionFilter, onlyInStock, minPrice, maxPrice]);
  const allProductOptions = useMemo(() => [...new Set(products.flatMap((product) => (product.options || "").split(",").map((value) => value.trim()).filter(Boolean)))].sort(), [products]);
  const cartItems = useMemo(() => Object.entries(cart).map(([cartKey, quantity]) => {
    const [id, ...optionParts] = cartKey.split("::");
    const product = products.find((item) => item.id === id);
    if (!product) return null;
    const price = Math.round(product.price * (100 - (product.discountPercent || 0)) / 100);
    return { ...product, cartKey, option: optionParts.join("::"), quantity, unitPrice: price, lineTotal: price * quantity };
  }).filter(Boolean), [cart, products]);
  const subtotal = cartItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const deliveryFee = subtotal > 0 && subtotal < 5000 ? 150 : 0;
  const total = subtotal + deliveryFee;

  function addToCart(product, option = "") {
    if (product.options?.trim() && !option) return setNotice(`Choose an option for ${product.name} first`);
    const cartKey = `${product.id}::${option}`;
    const alreadyAdded = Object.entries(cart).filter(([key]) => key.startsWith(`${product.id}::`)).reduce((sum, [, quantity]) => sum + quantity, 0);
    if (alreadyAdded >= product.stock) return setNotice(`Only ${product.stock} ${product.name} available`);
    setCart((current) => ({ ...current, [cartKey]: (current[cartKey] || 0) + 1 }));
    setNotice(`${product.name} added to your bag`);
  }
  function updateCart(cartKey, quantity, stock) {
    setCart((current) => {
      const next = { ...current };
      const productId = cartKey.split("::")[0];
      const otherQuantity = Object.entries(next).filter(([key]) => key.startsWith(`${productId}::`) && key !== cartKey).reduce((sum, [, count]) => sum + count, 0);
      const safeQuantity = Math.min(quantity, Math.max(0, stock - otherQuantity));
      if (safeQuantity <= 0) delete next[cartKey]; else next[cartKey] = safeQuantity;
      return next;
    });
  }
  async function placeOrder(event) {
    event.preventDefault();
    if (!cartItems.length) return setNotice("Your bag is empty. Find something you love first.");
    if (paymentMethod !== "Cash on Delivery" && (!paymentConfirmed || !paymentProof)) return setNotice("Confirm your payment and upload the payment screenshot to continue.");
    try {
      const order = await api("/api/orders", { method: "POST", body: JSON.stringify({ customer: { ...customer, email: customer.email || null }, items: cartItems.map((item) => ({ productId: item.id, quantity: item.quantity, option: item.option })), paymentMethod, paymentProof: paymentProof || null }) });
      setCart({});
      setCustomer({ name: "", phone: "", email: "", address: "", city: "", note: "" });
      setPaymentConfirmed(false); setPaymentProof(""); setProofName("");
      setNotice("");
      setOrderConfirmation(order);
      await loadStore().catch(() => {});
    } catch (error) { setNotice(error.message); }
  }

  if (loading) return <main className="loading-screen"><Sparkles /><span>Opening Classsy Collection</span></main>;
  if (!site) return <main className="loading-screen"><Sparkles /><span>Unable to open the shop</span><p role="alert">{notice}</p><button className="button button-dark" onClick={loadStore}>Try again <ArrowRight size={16} /></button></main>;
  const promoText = site.todayOffer || site.announcement;
  return <>
    <div className="announcement-bar"><Sparkles size={14} /> <span>{promoText}</span><a href="#products">Shop the edit <ArrowRight size={13} /></a></div>
    <header className="topbar">
      <a className="brand" href="#home"><span className="brand-mark">C</span><span><strong>{site.brand}</strong><small>{site.tagline}</small></span></a>
      <button className="mobile-menu-toggle icon-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu">{mobileMenu ? <X /> : <Menu />}</button>
      <nav className={mobileMenu ? "nav-links open" : "nav-links"} aria-label="Primary navigation">
        <a href="#products" onClick={() => setMobileMenu(false)}>Shop all</a><a href="#collections" onClick={() => setMobileMenu(false)}>Collections</a><a href="#contact" onClick={() => setMobileMenu(false)}>Our story</a>
        <a className="bag-link" href="#checkout" onClick={() => setMobileMenu(false)}><ShoppingBag size={17} /> Bag <span>{cartItems.reduce((count, item) => count + item.quantity, 0)}</span></a>
      </nav>
    </header>
    <main>
      <section id="home" className="hero">
        <div className="hero-copy"><p className="eyebrow"><span /> DRESS LIKE YOU MEAN IT</p><h1>{site.heroTitle}</h1><p className="hero-subtitle">{site.heroSubtitle}</p><div className="hero-actions"><a className="button button-dark" href="#products">Explore the collection <ArrowRight size={17} /></a><a className="text-link" href="#collections">Discover your style <ArrowDownRight size={16} /></a></div><div className="hero-note"><span className="note-stars">★★★★★</span><span>Curated with love in Kathmandu</span></div></div>
        <div className="hero-visual"><img src={site.heroImage || "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=88"} alt="Friends exploring a colorful fashion collection" /><div className="hero-stamp"><span>THE</span><strong>STYLE<br />EDIT</strong><span>VOL. 01</span></div><div className="hero-caption"><span>NEW SEASON</span><strong>Little things. Big energy.</strong></div></div>
        <div className="hero-index">01 <span /> 04</div>
      </section>

      {site.groupSale && <a className="group-sale-banner" href="#products"><span className="group-icon"><Heart size={19} /></span><span><small>THE MORE, THE LOVELIER</small><strong>{site.groupSale}</strong></span><span className="group-cta">Shop group picks <ArrowRight size={16} /></span></a>}
      {notice && <div className="notice" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16} /></button></div>}

      <section id="collections" className="collection-intro"><div><p className="eyebrow"><span /> MADE FOR YOUR EVERYDAY</p><h2>Your kind of <em>pretty.</em></h2></div><p>From the outfit you reach for twice a week to the little finishing touches you never take off. Find your next favorite here.</p></section>
      <section className="category-editorial" aria-label="Shop collections">
        {categories.map((category, index) => {
          const tileTitles = { "Girls Clothes": "Wear the moment", Jewellery: "A little extra", Nails: "Tip to toe", Makeup: "Your glow, your rules" };
          const categoryProduct = products.find((product) => product.category === category);
          return <button className="category-tile" key={category} onClick={() => { setSelectedCategory(category); document.querySelector("#products")?.scrollIntoView({ behavior: "smooth" }); }}><img src={categoryProduct?.image || site.heroImage} alt="" /><span className="tile-number">{String(index + 1).padStart(2, "0")}</span><span className="tile-copy"><small>{category}</small><strong>{tileTitles[category] || `Explore ${category}`}</strong></span><span className="tile-arrow"><ArrowRight size={19} /></span></button>;
        })}
      </section>

      <section id="products" className="section product-section"><div className="section-heading"><div><p className="eyebrow"><span /> THE GOOD STUFF</p><h2>Find your <em>favorite.</em></h2></div><p>Thoughtful finds for all the ways you show up.</p></div>
        <div className="tabs" role="tablist" aria-label="Product categories">{["All", ...categories].map((category) => <button className={category === selectedCategory ? "active" : ""} key={category} onClick={() => setSelectedCategory(category)}>{category}</button>)}</div>
        <div className="product-tools"><label className="product-search"><Search size={17} /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search pieces, styles, offers" aria-label="Search products" /></label><label className="stock-filter"><input type="checkbox" checked={onlyInStock} onChange={(event) => setOnlyInStock(event.target.checked)} /> In stock</label><div className="price-filter"><span><SlidersHorizontal size={15} /> Price</span><input type="number" min="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder="Min" aria-label="Minimum price" /><span>to</span><input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder="Max" aria-label="Maximum price" /></div><label className="option-filter"><span>Size / finish</span><select value={selectedOptionFilter} onChange={(event) => setSelectedOptionFilter(event.target.value)}><option value="">All options</option>{allProductOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label className="sort-filter"><span>Sort</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name</option></select></label></div>
        <div className="results-count"><span>{visibleProducts.length} {visibleProducts.length === 1 ? "piece" : "pieces"}</span>{(searchQuery || selectedCategory !== "All" || onlyInStock || minPrice || maxPrice || selectedOptionFilter) && <button onClick={() => { setSelectedCategory("All"); setSearchQuery(""); setOnlyInStock(false); setMinPrice(""); setMaxPrice(""); setSelectedOptionFilter(""); }}>Clear filters</button>}</div>
        <div className="product-grid">{visibleProducts.map((product, index) => {
          const currentPrice = Math.round(product.price * (100 - (product.discountPercent || 0)) / 100);
          const options = (product.options || "").split(",").map((value) => value.trim()).filter(Boolean);
          return <article className="product-card" key={product.id}><div className="product-image"><img src={product.image} alt={product.name} loading="lazy" />{(product.offerLabel || product.discountPercent > 0 || product.featured) && <span className="product-badge">{product.offerLabel || (product.discountPercent ? `${product.discountPercent}% off` : "JUST IN")}</span>}<button className="favorite-button" aria-label={`Save ${product.name}`}><Heart size={17} /></button></div><div className="product-meta"><div><span className="product-category">{product.category} <i>·</i> {product.style}</span><h3>{product.name}</h3></div><div className="product-price"><strong>{currency(currentPrice)}</strong>{product.discountPercent > 0 && <del>{currency(product.price)}</del>}</div></div>{product.description && <p className="product-description">{product.description}</p>}{options.length > 0 && <label className="product-option-picker"><span>Choose size / finish</span><select value={selectedOptions[product.id] || ""} onChange={(event) => setSelectedOptions({ ...selectedOptions, [product.id]: event.target.value })}><option value="">Select an option</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>}<button className="quick-add" onClick={() => addToCart(product, selectedOptions[product.id] || "")} disabled={product.stock <= 0}>{product.stock <= 0 ? "Sold out" : <><Plus size={15} /> {options.length && !selectedOptions[product.id] ? "Choose an option" : "Add to bag"}</>}</button><div className="product-stock">{product.stock > 0 ? `${product.stock} ready to ship` : "Currently sold out"}<span>{String(index + 1).padStart(2, "0")}</span></div></article>;
        })}</div>
        {!visibleProducts.length && <p className="empty-state">No pieces in this collection just yet.</p>}
      </section>

      <section className="brand-note"><div className="brand-note-image"><img src="https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85" alt="A confident fashion look in warm afternoon light" /></div><div className="brand-note-copy"><p className="eyebrow"><span /> A NOTE FROM CLASSsy</p><h2>Style is a feeling. <em>Make it yours.</em></h2><p>We bring together the clothes, details, and little beauty rituals that make getting ready feel like you. Picked with care, packed with love, sent from Kathmandu.</p><a className="text-link" href="#contact">Meet your style people <ArrowRight size={16} /></a><span className="scribble">with love, CC</span></div></section>

      <section id="checkout" className="checkout-layout"><div className="section-heading"><div><p className="eyebrow"><span /> READY WHEN YOU ARE</p><h2>Your bag, your <em>call.</em></h2></div><p>Free delivery on orders over NPR 5,000.</p></div><div className="cart-panel"><div className="cart-list"><div className="cart-heading"><h3>Your bag <span>{cartItems.reduce((count, item) => count + item.quantity, 0)}</span></h3><a href="#products">Keep shopping <ArrowRight size={14} /></a></div>
          {!cartItems.length ? <div className="empty-bag"><ShoppingBag size={28} /><strong>A little room for something lovely.</strong><a href="#products">Explore the collection <ArrowRight size={14} /></a></div> : cartItems.map((item) => <div className="cart-item" key={item.cartKey}><img src={item.image} alt={item.name} /><div className="cart-item-info"><strong>{item.name}</strong><span>{item.option || item.style}</span><div className="quantity-control"><button type="button" onClick={() => updateCart(item.cartKey, item.quantity - 1, item.stock)} aria-label="Decrease quantity"><Minus size={13} /></button><span>{item.quantity}</span><button type="button" onClick={() => updateCart(item.cartKey, item.quantity + 1, item.stock)} aria-label="Increase quantity"><Plus size={13} /></button></div></div><strong className="cart-line-total">{currency(item.lineTotal)}</strong><button className="remove-item icon-button" onClick={() => updateCart(item.cartKey, 0, item.stock)} aria-label={`Remove ${item.name}`}><Trash2 size={15} /></button></div>)}
          <dl className="totals"><div><dt>Subtotal</dt><dd>{currency(subtotal)}</dd></div><div><dt>Delivery</dt><dd>{deliveryFee ? currency(deliveryFee) : subtotal ? "On us" : currency(0)}</dd></div><div className="total-row"><dt>Total</dt><dd>{currency(total)}</dd></div></dl><p className="secure-note"><PackageCheck size={16} /> Carefully packed. Delivered to your door.</p></div>
        <form className="checkout-form" onSubmit={placeOrder}><div className="form-title"><span>01</span><div><h3>Where should we send it?</h3><p>Your details stay between us.</p></div></div><div className="form-grid"><Field label="Full name"><input required autoComplete="name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Your name" /></Field><Field label="Phone number"><input required autoComplete="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="+977" /></Field><Field label="Email (optional)"><input type="email" autoComplete="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder="you@example.com" /></Field><Field label="City"><input required autoComplete="address-level2" value={customer.city} onChange={(e) => setCustomer({ ...customer, city: e.target.value })} placeholder="Kathmandu" /></Field><Field label="Delivery address"><textarea required autoComplete="street-address" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder="Street, area, landmarks" /></Field><Field label="Order note (optional)"><textarea value={customer.note} onChange={(e) => setCustomer({ ...customer, note: e.target.value })} placeholder="Anything we should know?" /></Field></div>
          <div className="form-title payment-title"><span>02</span><div><h3>Choose how to pay</h3><p>Pick what works best for you.</p></div></div><div className="payment-options">{[["eSewa", "eSewa", "Pay with eSewa"], ["Mobile Banking", "Mobile banking", "Scan with your banking app"], ["Cash on Delivery", "Pay at the door", "Cash when your order arrives"]].map(([value, title, subtitle]) => <button type="button" key={value} onClick={() => { setPaymentMethod(value); setPaymentConfirmed(false); setPaymentProof(""); setProofName(""); }} className={`payment-option ${paymentMethod === value ? "selected" : ""}`}><span className="radio-dot">{paymentMethod === value && <i />}</span><span className={`payment-mark ${value === "eSewa" ? "esewa" : value === "Mobile Banking" ? "banking" : "cod"}`}>{value === "eSewa" ? "e" : value === "Mobile Banking" ? "⌂" : "Rs"}</span><span><strong>{title}</strong><small>{subtitle}</small></span>{paymentMethod === value && <Check size={16} className="option-check" />}</button>)}</div>
          {paymentMethod !== "Cash on Delivery" && <div className="payment-instructions"><div className="qr-frame">{(paymentMethod === "eSewa" ? site.esewaQr : site.mobileBankingQr) ? <img src={paymentMethod === "eSewa" ? site.esewaQr : site.mobileBankingQr} alt={`${paymentMethod} payment QR code`} /> : <div className="qr-empty"><Upload size={20} /><span>QR coming soon</span></div>}</div><div className="payment-how"><span className="payment-step">PAYMENT DETAILS</span><h4>Scan & pay with {paymentMethod}</h4><p>Open your {paymentMethod === "eSewa" ? "eSewa" : "mobile banking"} app, scan the store QR code, and pay <strong>{currency(total)}</strong>.</p><label className={`paid-toggle ${paymentConfirmed ? "is-paid" : ""}`}><input type="checkbox" checked={paymentConfirmed} onChange={(e) => setPaymentConfirmed(e.target.checked)} /><span className="toggle-box">{paymentConfirmed && <Check size={13} />}</span><strong>I’ve completed the payment</strong></label>{paymentConfirmed && <label className="upload-proof"><input type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { setNotice("Choose an image under 5 MB."); return; } setPaymentProof(await fileAsDataUrl(file)); setProofName(file.name); }} /><Upload size={16} /><span>{proofName || "Upload payment screenshot"}</span>{paymentProof && <CheckCircle2 size={16} />}</label>}</div></div>}
          <button className="button button-dark place-order" disabled={!cartItems.length}>{paymentMethod === "Cash on Delivery" ? "Place your order" : "Place order with proof"}<ArrowRight size={17} /></button><p className="order-terms">By placing your order, you agree to our store terms. We’ll confirm your order by phone.</p></form></div></section>

      <section id="contact" className="contact-section"><div className="contact-heading"><p className="eyebrow"><span /> WE’RE RIGHT HERE</p><h2>Need a hand? <em>Say hello.</em></h2><p>Style questions, order updates, or just a little chat. We’d love to hear from you.</p></div><div className="contact-links"><a href={`tel:${site.phone}`}><Phone /><span><small>GIVE US A CALL</small><strong>{site.phone}</strong></span><ArrowRight /></a><a href={`mailto:${site.email}`}><Mail /><span><small>DROP US A NOTE</small><strong>{site.email}</strong></span><ArrowRight /></a><div><MapPin /><span><small>FIND OUR CORNER</small><strong>{site.address}</strong></span></div><a href={`https://instagram.com/${site.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer"><Instagram /><span><small>FOLLOW ALONG</small><strong>{site.instagram}</strong></span><ArrowRight /></a><a href={`https://wa.me/${site.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><Phone /><span><small>CHAT ON WHATSAPP</small><strong>{site.whatsapp}</strong></span><ArrowRight /></a></div></section>
    </main>
    <section className="service-policies" aria-label="Delivery and exchange information"><article><PackageCheck size={20} /><div><h3>Delivery details</h3><p>{site.deliveryInfo}</p></div></article><article><Heart size={20} /><div><h3>Returns & exchanges</h3><p>{site.returnPolicy}</p></div></article></section>
    <footer className="footer"><a className="brand" href="#home"><span className="brand-mark">C</span><span><strong>{site.brand}</strong><small>Good things, chosen for you.</small></span></a><span>Made with love in Kathmandu · © {new Date().getFullYear()}</span><a href="#home">Back to top ↑</a></footer>
    {orderConfirmation && <div className="order-success-backdrop" role="presentation"><section className="order-success" role="dialog" aria-modal="true" aria-labelledby="order-success-title"><button className="success-close icon-button" onClick={() => setOrderConfirmation(null)} aria-label="Close order confirmation"><X size={18} /></button><div className="success-icon"><CheckCircle2 size={29} /></div><p className="eyebrow"><span /> ORDER RECEIVED</p><h2 id="order-success-title">Thank you, <em>{orderConfirmation.customer.name.trim().split(/\s+/)[0]}.</em></h2><p className="success-copy">Your order is in! We’ll contact you to confirm the delivery details.</p><div className="success-order-number"><span>ORDER NUMBER</span><strong>{orderConfirmation.id}</strong><b>{currency(orderConfirmation.total)}</b></div><div className="success-empty-bag"><ShoppingBag size={17} /><strong>Your bag is empty now.</strong><a href="#products" onClick={() => setOrderConfirmation(null)}>Keep browsing <ArrowRight size={14} /></a></div><div className="success-help"><h3>Need to share delivery details?</h3><p>Message us on WhatsApp or Instagram and we’ll help you out.</p><div className="success-contact-links"><a href={`https://wa.me/${site.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><Phone size={17} /><span><small>WHATSAPP</small><strong>{site.whatsapp}</strong></span><ArrowRight size={15} /></a><a href={`https://instagram.com/${site.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer"><Instagram size={17} /><span><small>INSTAGRAM</small><strong>{site.instagram}</strong></span><ArrowRight size={15} /></a></div></div><button className="button button-dark success-done" onClick={() => setOrderConfirmation(null)}>Continue shopping <ArrowRight size={16} /></button></section></div>}
  </>;
}

function AdminPage() {
  const [token, setToken] = useState(localStorage.getItem("classsyAdminToken") || "");
  const [login, setLogin] = useState({ username: "admin", password: "" });
  const [site, setSite] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [productDraft, setProductDraft] = useState(emptyProduct);
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const categories = categoryFallback;

  async function loadAdmin(activeToken = token) {
    if (!activeToken) return;
    try {
      const [sitePayload, orderPayload] = await Promise.all([api("/api/site"), api("/api/orders", { token: activeToken })]);
      setSite(sitePayload.site); setProducts(sitePayload.products); setOrders(orderPayload); setError("");
    } catch (err) { setError(err.message); if (err.message.toLowerCase().includes("admin")) { setToken(""); localStorage.removeItem("classsyAdminToken"); } }
  }
  useEffect(() => { loadAdmin(); }, []);
  async function submitLogin(event) {
    event.preventDefault(); setError("");
    try { const response = await api("/api/admin/login", { method: "POST", body: JSON.stringify(login) }); localStorage.setItem("classsyAdminToken", response.token); setToken(response.token); await loadAdmin(response.token); }
    catch (err) { setError(err.message); }
  }
  async function signOut() {
    try { if (token) await api("/api/admin/logout", { method: "POST", token }); }
    catch { /* Clear the local session even if the backend is unavailable. */ }
    localStorage.removeItem("classsyAdminToken"); setToken(""); setSite(null);
  }
  async function saveSite(event) {
    event.preventDefault(); setError("");
    try { const saved = await api("/api/site", { method: "PUT", token, body: JSON.stringify(site) }); setSite(saved); setMessage("Store settings updated."); }
    catch (err) { setError(err.message); }
  }
  async function saveProduct(event) {
    event.preventDefault(); setError("");
    try {
      await api(editingId ? `/api/products/${editingId}` : "/api/products", { method: editingId ? "PUT" : "POST", token, body: JSON.stringify({ ...productDraft, price: Number(productDraft.price), stock: Number(productDraft.stock), discountPercent: Number(productDraft.discountPercent) }) });
      setProductDraft(emptyProduct); setEditingId(""); setMessage("Product saved."); await loadAdmin();
    } catch (err) { setError(err.message); }
  }
  async function removeProduct(id) {
    if (!window.confirm("Remove this product from the store?")) return;
    try { await api(`/api/products/${id}`, { method: "DELETE", token }); setMessage("Product removed."); await loadAdmin(); } catch (err) { setError(err.message); }
  }
  async function updateOrder(orderId, data) {
    try { const updated = await api(`/api/orders/${orderId}`, { method: "PUT", token, body: JSON.stringify(data) }); setOrders((all) => all.map((order) => order.id === orderId ? updated : order)); }
    catch (err) { setError(err.message); }
  }
  function editProduct(product) { setEditingId(product.id); setProductDraft({ ...emptyProduct, ...product }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function uploadQr(file, key) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Choose a QR image under 5 MB."); return; }
    try { setSite({ ...site, [key]: await fileAsDataUrl(file) }); setMessage("QR image ready. Save payment details to publish it."); }
    catch { setError("Could not read this image file."); }
  }
  async function uploadHero(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Choose a hero image under 5 MB."); return; }
    try { setSite({ ...site, heroImage: await fileAsDataUrl(file) }); setMessage("Hero image ready. Save store settings to publish it."); }
    catch { setError("Could not read this image file."); }
  }
  if (!token || !site) return <main className="admin-shell"><a href="/" className="admin-brand"><span className="brand-mark">C</span><strong>Classsy <i>Studio</i></strong></a><form className="admin-login" onSubmit={submitLogin}><div className="admin-login-mark"><span className="brand-mark">C</span></div><p className="eyebrow"><span /> PRIVATE STORE ACCESS</p><h1>Welcome back.</h1><p>Sign in to manage your collection.</p>{error && <div className="admin-error">{error}</div>}<Field label="Username"><input autoComplete="username" value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} /></Field><Field label="Password"><input type="password" autoComplete="current-password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></Field><button className="button button-dark">Sign in <ArrowRight size={16} /></button><a href="/" className="text-link"><ArrowLeft size={15} /> Back to the shop</a></form></main>;

  return <div className="admin-app"><header className="admin-topbar"><a href="/" className="admin-brand"><span className="brand-mark">C</span><strong>Classsy <i>Studio</i></strong></a><div className="admin-top-right"><span className="admin-status"><i /> Store is live</span><a href="/" className="admin-view-store">View storefront <ArrowRight size={15} /></a><button className="icon-button" title="Sign out" onClick={signOut}><X size={17} /></button></div></header><main className="admin-main"><div className="admin-welcome"><div><p className="eyebrow"><span /> YOUR LITTLE CORNER OF THE INTERNET</p><h1>Good morning, <em>Classsy.</em></h1><p>Manage your shop, share a new offer, and keep orders moving.</p></div><div className="admin-summary"><div><small>PRODUCTS</small><strong>{products.length}</strong></div><div><small>ORDERS</small><strong>{orders.length}</strong></div><div><small>TO FULFILL</small><strong>{orders.filter((order) => !["Delivered", "Cancelled"].includes(order.status)).length}</strong></div></div></div>
    {error && <div className="admin-error">{error}</div>}{message && <div className="admin-message"><CheckCircle2 size={16} />{message}<button onClick={() => setMessage("")}><X size={15} /></button></div>}
    <section className="admin-block">
      <div className="admin-block-heading"><div><span className="admin-block-number">01</span><div><h2>Today’s edit</h2><p>Offers customers see across the shop.</p></div></div></div>
      <form className="admin-settings" onSubmit={saveSite}>
        <Field label="Store name"><input value={site.brand} onChange={(e) => setSite({ ...site, brand: e.target.value })} /></Field>
        <Field label="Store tagline"><input value={site.tagline} onChange={(e) => setSite({ ...site, tagline: e.target.value })} /></Field>
        <Field label="Top announcement"><input value={site.announcement} onChange={(e) => setSite({ ...site, announcement: e.target.value })} /></Field>
        <Field label="Today’s offer"><input value={site.todayOffer || ""} onChange={(e) => setSite({ ...site, todayOffer: e.target.value })} placeholder="e.g. Today only: 15% off your first order" /></Field>
        <Field label="Group sale / bundle offer"><input value={site.groupSale || ""} onChange={(e) => setSite({ ...site, groupSale: e.target.value })} placeholder="e.g. Bring a friend: 20% off when you shop together" /></Field>
        <Field label="Hero headline"><input value={site.heroTitle} onChange={(e) => setSite({ ...site, heroTitle: e.target.value })} /></Field>
        <Field label="Hero description"><textarea value={site.heroSubtitle} onChange={(e) => setSite({ ...site, heroSubtitle: e.target.value })} /></Field>
        <Field label="Hero photo"><div className="product-photo-admin">{site.heroImage && <img src={site.heroImage} alt="Storefront hero preview" />}<label className="button button-light"><Upload size={15} /> Upload hero photo<input type="file" accept="image/*" onChange={(e) => uploadHero(e.target.files?.[0])} /></label><details className="image-url-edit"><summary>Use an image URL instead</summary><input value={site.heroImage || ""} onChange={(e) => setSite({ ...site, heroImage: e.target.value })} placeholder="Paste image URL" /></details></div></Field>
        <div className="admin-form-actions"><button className="button button-dark"><Check size={16} /> Save store settings</button></div>
      </form>
    </section>
    <section className="admin-block"><div className="admin-block-heading"><div><span className="admin-block-number">02</span><div><h2>Payment & contact</h2><p>Update payment codes and the details customers use to reach you.</p></div></div></div><form className="admin-settings" onSubmit={saveSite}><Field label="eSewa QR image"><div className="qr-admin-field">{site.esewaQr && <img src={site.esewaQr} alt="eSewa QR preview" />}<label className="button button-light"><Upload size={15} /> Choose eSewa QR<input type="file" accept="image/*" onChange={(e) => uploadQr(e.target.files?.[0], "esewaQr")} /></label></div></Field><Field label="Mobile banking QR image"><div className="qr-admin-field">{site.mobileBankingQr && <img src={site.mobileBankingQr} alt="Mobile banking QR preview" />}<label className="button button-light"><Upload size={15} /> Choose banking QR<input type="file" accept="image/*" onChange={(e) => uploadQr(e.target.files?.[0], "mobileBankingQr")} /></label></div></Field><Field label="Store phone"><input value={site.phone} onChange={(e) => setSite({ ...site, phone: e.target.value })} /></Field><Field label="Store email"><input value={site.email} onChange={(e) => setSite({ ...site, email: e.target.value })} /></Field><Field label="Store address"><input value={site.address} onChange={(e) => setSite({ ...site, address: e.target.value })} /></Field><Field label="Instagram handle"><input value={site.instagram} onChange={(e) => setSite({ ...site, instagram: e.target.value })} /></Field><Field label="WhatsApp phone"><input value={site.whatsapp || ""} onChange={(e) => setSite({ ...site, whatsapp: e.target.value })} /></Field><div className="admin-form-actions"><button className="button button-dark"><Check size={16} /> Save payment & contact</button></div></form></section>
    <section className="admin-block">
      <div className="admin-block-heading"><div><span className="admin-block-number">03</span><div><h2>{editingId ? "Edit this piece" : "Add a new piece"}</h2><p>Product photos, prices, stock, and offers.</p></div></div></div>
      <form className="admin-settings" onSubmit={saveProduct}>
        <Field label="Product name"><input required value={productDraft.name} onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })} /></Field>
        <Field label="Category"><select value={productDraft.category} onChange={(e) => setProductDraft({ ...productDraft, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></Field>
        <Field label="Price (NPR)"><input type="number" min="1" required value={productDraft.price} onChange={(e) => setProductDraft({ ...productDraft, price: e.target.value })} /></Field>
        <Field label="Discount (%)"><input type="number" min="0" max="95" value={productDraft.discountPercent ?? 0} onChange={(e) => setProductDraft({ ...productDraft, discountPercent: e.target.value })} /></Field>
        <Field label="Style / variant"><input required value={productDraft.style} onChange={(e) => setProductDraft({ ...productDraft, style: e.target.value })} /></Field>
        <Field label="Customer options"><input value={productDraft.options || ""} onChange={(e) => setProductDraft({ ...productDraft, options: e.target.value })} placeholder="Sizes or finishes, separated by commas" /></Field>
        <Field label="Offer label"><input value={productDraft.offerLabel || ""} onChange={(e) => setProductDraft({ ...productDraft, offerLabel: e.target.value })} placeholder="e.g. TODAY ONLY" /></Field>
        <Field label="Stock quantity"><input type="number" min="0" value={productDraft.stock} onChange={(e) => setProductDraft({ ...productDraft, stock: e.target.value })} /></Field>
        <Field label="Product photo"><div className="product-photo-admin">{productDraft.image && <img src={productDraft.image} alt="Selected product preview" />}<label className="button button-light"><Upload size={15} /> Upload product photo<input type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 5 * 1024 * 1024) { setError("Choose a product image under 5 MB."); return; } try { const image = await fileAsDataUrl(file); setProductDraft((current) => ({ ...current, image })); setMessage("Product image ready. Save the product to publish it."); } catch { setError("Could not read this image file."); } }} /></label><details className="image-url-edit"><summary>Use an image URL instead</summary><input required value={productDraft.image} onChange={(e) => setProductDraft({ ...productDraft, image: e.target.value })} placeholder="Paste image URL" /></details></div></Field>
        <Field label="Description"><textarea required value={productDraft.description} onChange={(e) => setProductDraft({ ...productDraft, description: e.target.value })} /></Field>
        <label className="admin-featured"><input type="checkbox" checked={productDraft.featured} onChange={(e) => setProductDraft({ ...productDraft, featured: e.target.checked })} /> Feature this product in the collection</label>
        <div className="admin-form-actions"><button className="button button-dark">{editingId ? "Save changes" : "Add product"} <ArrowRight size={16} /></button>{editingId && <button type="button" className="button button-light" onClick={() => { setProductDraft(emptyProduct); setEditingId(""); }}>Cancel</button>}</div>
      </form>
    </section>
    <section className="admin-block"><div className="admin-block-heading"><div><span className="admin-block-number">04</span><div><h2>Your products</h2><p>Make changes whenever inspiration strikes.</p></div></div></div><div className="admin-product-list">{products.map((product) => <article className="admin-product" key={product.id}><img src={product.image} alt="" /><div><strong>{product.name}</strong><span>{product.category} · {currency(product.price)}{product.discountPercent ? ` · ${product.discountPercent}% off` : ""} · {product.stock} in stock</span></div><button className="button button-light" onClick={() => editProduct(product)}>Edit</button><button className="icon-button admin-delete" onClick={() => removeProduct(product.id)} aria-label={`Delete ${product.name}`}><Trash2 size={16} /></button></article>)}</div></section>
    <section className="admin-block"><div className="admin-block-heading"><div><span className="admin-block-number">05</span><div><h2>Orders <span className="order-count">{orders.length}</span></h2><p>Customer details, payment proof, and fulfillment.</p></div></div><button className="button button-light" onClick={() => loadAdmin()}>Refresh orders <ChevronDown size={15} /></button></div><div className="orders">{orders.length === 0 ? <p className="empty-state">No orders yet. Your first one will show up here.</p> : orders.map((order) => <article className="order-row" key={order.id}><div className="order-row-main"><div className="order-title"><strong>{order.id}</strong><span>{new Date(order.createdAt).toLocaleString()}</span><b>{currency(order.total)}</b></div><p>{order.customer.name} · {order.customer.phone} · {order.customer.city}</p><small>{order.customer.address}</small><small>{order.items.map((item) => `${item.name}${item.option ? ` (${item.option})` : ""} × ${item.quantity}`).join(" · ")}</small><div className="order-payment"><strong>{order.paymentMethod}</strong><span className={order.paymentProof ? "proof-status submitted" : "proof-status"}>{order.paymentProof ? "Payment screenshot received" : order.paymentStatus || "No payment proof"}</span>{order.paymentProof && <a href={order.paymentProof} target="_blank" rel="noreferrer">View payment screenshot <ArrowRight size={13} /></a>}</div></div><div className="order-controls"><label>Status<select value={order.status} onChange={(e) => updateOrder(order.id, { status: e.target.value })}>{["New", "Confirmed", "Packed", "Delivered", "Cancelled"].map((status) => <option key={status}>{status}</option>)}</select></label>{order.paymentMethod !== "Cash on Delivery" && <label>Payment<select value={order.paymentStatus || "Awaiting payment"} onChange={(e) => updateOrder(order.id, { paymentStatus: e.target.value })}>{["Awaiting payment", "Proof submitted", "Verified", "Rejected"].map((status) => <option key={status}>{status}</option>)}</select></label>}</div></article>)}</div></section>
    <section className="admin-block"><div className="admin-block-heading"><div><span className="admin-block-number">06</span><div><h2>Delivery & exchanges</h2><p>Set clear expectations before customers place an order.</p></div></div></div><form className="admin-settings" onSubmit={saveSite}><Field label="Delivery information"><textarea value={site.deliveryInfo || ""} onChange={(e) => setSite({ ...site, deliveryInfo: e.target.value })} placeholder="Delivery timing, fees, and service areas" /></Field><Field label="Returns & exchange policy"><textarea value={site.returnPolicy || ""} onChange={(e) => setSite({ ...site, returnPolicy: e.target.value })} placeholder="Let customers know how to ask about exchanges" /></Field><div className="admin-form-actions"><button className="button button-dark"><Check size={16} /> Save delivery policies</button></div></form></section></main></div>;
}

export default App;
