'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCheck, Flower2, Heart, Leaf, MessageCircle, Plus, RefreshCw, SlidersHorizontal, Users, X } from 'lucide-react';
import { readStoredBrief, type WeddingBrief } from '@/lib/wedding';
import { BRIEF_STORAGE, SESSION_STORAGE, planningRequest, PlanningError, type Session, type Wedding } from '@/lib/planning-api';
import { emptyCriteria, sgd, type Diet, type VendorCriteria, type VendorResult, type VendorState } from '@/lib/vendors';
import css from './vendors.module.css';

export default function VendorsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<VendorState | null>(null);
  const [localBrief, setLocalBrief] = useState<WeddingBrief | null>(null);
  const [criteria, setCriteria] = useState<VendorCriteria>(emptyCriteria);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const busyRef = useRef(false);
  const comparison = useRef<HTMLElement>(null);

  function accept(next: VendorState) { setState(next); setCriteria(next.criteria); setDirty(false); }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const raw = localStorage.getItem(BRIEF_STORAGE);
        if (raw && active) setLocalBrief(readStoredBrief(JSON.parse(raw)));
      } catch { /* The server session can still be used when local storage is unavailable. */ }
      try {
        const raw = sessionStorage.getItem(SESSION_STORAGE);
        if (raw) {
          const saved = JSON.parse(raw);
          if (typeof saved.id === 'string' && typeof saved.token === 'string') {
            if (active) setSession(saved);
            const next = await planningRequest<VendorState>(`/api/weddings/${saved.id}/vendors`, saved);
            if (active) accept(next);
          }
        }
      } catch (issue) { if (active) setError((issue as Error).message); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function perform(action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (issue) {
      if (issue instanceof PlanningError && issue.status === 409 && session) {
        // Preserve unsaved filters while refreshing the revision and saved comparison.
        try { setState(await planningRequest<VendorState>(`/api/weddings/${session.id}/vendors`, session)); } catch { /* Keep original failure. */ }
        setDirty(true);
        setError('Your wedding or shortlist changed. The saved comparison is refreshed; review your filters and try again.');
      } else { setError((issue as Error).message); }
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function connect() {
    if (!localBrief) return;
    await perform(async () => {
      const created = await planningRequest<{ wedding: Wedding; access_token: string }>('/api/weddings', null, { brief: localBrief });
      const current = { id: created.wedding.id, token: created.access_token };
      setSession(current);
      try { sessionStorage.setItem(SESSION_STORAGE, JSON.stringify(current)); }
      catch { setNotice('Keep this tab open; your browser couldn’t save the planning session.'); }
      accept(await planningRequest<VendorState>(`/api/weddings/${current.id}/vendors`, current));
    });
  }

  function updateCriteria(next: VendorCriteria) { setCriteria(next); setDirty(true); }
  function toggleDiet(diet: Diet) {
    updateCriteria({ ...criteria, dietary_requirements: criteria.dietary_requirements.includes(diet) ? criteria.dietary_requirements.filter(item => item !== diet) : [...criteria.dietary_requirements, diet] });
  }

  async function save(change: { criteria?: VendorCriteria; shortlisted_ids?: string[] }) {
    if (!session || !state) return;
    await perform(async () => {
      const next = await planningRequest<VendorState>(`/api/weddings/${session.id}/vendors`, session, { expected_revision: state.revision, brief_revision: state.wedding.revision, ...change }, 'PATCH');
      accept(next);
      setNotice(change.criteria ? 'Your catering preferences are saved. The matches and estimates are updated.' : 'Your comparison shortlist is saved.');
    });
  }

  function toggleVendor(id: string) {
    if (!state || dirty || state.needs_review) return;
    const ids = state.shortlisted_ids.includes(id) ? state.shortlisted_ids.filter(item => item !== id) : [...state.shortlisted_ids, id];
    if (ids.length > 3) { setError('Compare up to three packages. Remove one to add another.'); return; }
    void save({ shortlisted_ids: ids });
  }

  const selected = state?.results.filter(item => state.shortlisted_ids.includes(item.vendor.id)) ?? [];
  const results = state?.results.filter(item => (showAll || state.needs_review || item.matches) && `${item.vendor.name} ${item.vendor.tagline} ${item.vendor.service_style}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const brief = state?.wedding.brief;
  const needsGuestCount = !!state && !brief?.guests;
  const overOverallBudget = !!(criteria.catering_budget && brief?.budget && Number(criteria.catering_budget) > Number(brief.budget));
  const locked = busy || dirty || !!state?.needs_review;

  function gap(item: VendorResult): string {
    if (item.vendor.unpriced_dietary_extras.some(need => state?.criteria.dietary_requirements.includes(need))) return 'Menu upgrade unpriced — confirm the total';
    const amount = item.estimate?.budget_difference;
    if (amount == null) return 'No catering budget set';
    return `${sgd(String(Math.abs(Number(amount))))} ${Number(amount) < 0 ? 'over' : 'under'} budget`;
  }

  return <div className={css.shell}>
    <header className={css.header}><Link href="/" className={css.brand}><Flower2 size={26} />ever after<span>.</span></Link><nav aria-label="Wedding navigation"><Link href="/"><ArrowLeft size={14} />Your vision</Link><Link href="/planner"><MessageCircle size={15} />Your planner</Link><span aria-current="page">Your vendors</span></nav></header>
    <main className={css.main}>
      <div className={css.heading}><div><span className={css.eyebrow}><Leaf size={14} /> THE PEOPLE WHO BRING IT TO LIFE</span><h1>A table for <em>your kind of celebration.</em></h1><p>Start with catering. Explore the fit, understand the numbers, and keep a few possibilities close.</p></div>{state && <button className={css.refresh} disabled={busy} onClick={() => session && void perform(async () => { accept(await planningRequest<VendorState>(`/api/weddings/${session.id}/vendors`, session)); })}><RefreshCw size={15} />Refresh saved matches</button>}</div>
      {error && <div className={css.error} role="alert">{error}</div>}
      {notice && <div className={css.notice} role="status">{notice}</div>}
      {loading ? <p role="status">Finding your wedding details…</p> : !state ? <section className={css.empty}><Heart size={30} /><h2>Let’s start with your wedding.</h2><p>{localBrief ? 'Bring your saved vision into a planning session to compare catering packages for your guest count. This saves your brief with the planner.' : 'Create a wedding brief so we can use your guest count and location when comparing packages.'}</p>{localBrief ? <button className={css.primary} disabled={busy} onClick={() => void connect()}>{busy ? 'Opening…' : 'Use our saved wedding brief'}<ArrowRight size={16} /></button> : <Link href="/" className={css.primary}>Create our wedding brief<ArrowRight size={16} /></Link>}{session && <button className={css.textButton} disabled={busy} onClick={() => void perform(async () => accept(await planningRequest<VendorState>(`/api/weddings/${session.id}/vendors`, session)))}>Try reopening our vendor list</button>}</section> : <>
        <section className={css.sampleBanner}><span className={css.sampleBadge}>SAMPLE CATALOGUE</span><p>These six suppliers and packages are fictional examples. Prices are illustrative estimates, not vendor quotations. Date availability and dietary certification have not been checked.</p></section>
        <div className={css.briefStrip}><span><Users size={17} /><strong>{brief?.guests || 'Unknown'} guests</strong></span><span>{brief?.location || 'Location still to decide'}</span><span>Overall wedding budget <strong>{sgd(brief?.budget || null)}</strong></span><Link href="/planner">Update our brief<ArrowRight size={13} /></Link></div>
        <section className={css.filters} aria-label="Catering preferences">
          <div className={css.filterHeading}><SlidersHorizontal size={18} /><div><h2>What should the food make room for?</h2><p>Review dietary needs from your brief, then apply your filters. The catering budget is separate from the whole wedding.</p></div></div>
          {brief?.notes && <div className={css.requirements}><strong>From your saved brief</strong><p>{brief.notes}</p></div>}
          <form onSubmit={event => { event.preventDefault(); void save({ criteria }); }}>
            <div className={css.filterFields}><label>Catering budget (S$)<input aria-describedby="catering-budget-help" type="number" min="0.01" max="1000000000" step="0.01" placeholder="e.g. 6000" value={criteria.catering_budget ?? ''} disabled={busy} onChange={event => updateCriteria({ ...criteria, catering_budget: event.target.value || null })} /><span id="catering-budget-help">Optional. We won’t assign your entire wedding budget to catering.</span></label><label>Service style<select value={criteria.service_style} disabled={busy} onChange={event => updateCriteria({ ...criteria, service_style: event.target.value as VendorCriteria['service_style'] })}><option value="any">Open to both</option><option value="buffet">Buffet</option><option value="plated">Plated dinner</option></select></label><fieldset><legend>Required menu options</legend><div className={css.diets}>{(['halal', 'vegetarian', 'vegan'] as Diet[]).map(diet => <label key={diet}><input type="checkbox" checked={criteria.dietary_requirements.includes(diet)} disabled={busy} onChange={() => toggleDiet(diet)} />{diet}</label>)}</div><p>Sample menu support still needs supplier confirmation.</p></fieldset></div>
            {overOverallBudget && <p className={css.warning}>This catering budget is higher than your saved overall wedding budget. Review the amounts before choosing.</p>}
            {needsGuestCount && <p className={css.warning}>Add a guest count in <Link href="/planner">your planner</Link> before comparing totals.</p>}
            <div className={css.filterFooter}><span>{state.needs_review ? 'Review these filters against your latest wedding brief.' : dirty ? 'You have unapplied changes. The results below use your saved filters.' : 'Your catering preferences are saved.'}</span><button className={css.primary} disabled={busy} type="submit">{busy ? 'Saving…' : state.needs_review ? 'Review & match caterers' : 'Update matches'}<ArrowRight size={16} /></button></div>
          </form>
        </section>
        <div className={css.resultsHeading}><div><span className={css.eyebrow}>A FEW POSSIBILITIES</span><h2>{state.needs_review ? 'Explore the sample packages.' : `${state.matched_count} ${state.matched_count === 1 ? 'package fits' : 'packages fit'} your saved filters.`}</h2><p>{state.needs_review ? 'Apply your requirements above before building your shortlist.' : 'Matches check guest capacity, selected menu needs, service style and your catering budget. All availability remains unconfirmed.'}</p></div><button className={css.compareButton} disabled={!selected.length} onClick={() => comparison.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Compare {selected.length}/3<ArrowRight size={15} /></button></div>
        <div className={css.resultTools}><label><span className="sr-only">Search sample caterers</span><input type="search" placeholder="Find a sample caterer…" value={search} onChange={event => setSearch(event.target.value)} /></label><label><input type="checkbox" checked={showAll} onChange={event => setShowAll(event.target.checked)} />Show packages needing changes</label></div>
        {!state.needs_review && !state.matched_count && <div className={css.noMatches}><h3>No sample package meets all your filters.</h3><p>Review your budget, menu requirements or service style. You can also show packages needing changes to understand the trade-offs.</p><button className={css.textButton} onClick={() => setShowAll(true)}>Show all sample packages<ArrowRight size={14} /></button></div>}
        <div className={css.cards}>{results.map(item => <article className={`${css.card} ${!item.matches && !state.needs_review ? css.needsChanges : ''}`} key={item.vendor.id}>
          <div className={css.cardTop}><span className={css.vendorIcon}>{item.vendor.name.charAt(0)}</span><span className={css.sampleTag}>Fictional supplier</span></div>
          <span className={css.eyebrow}>{item.vendor.service_style === 'buffet' ? 'A SHARED SPREAD' : 'A SEATED CELEBRATION'}</span><h3>{item.vendor.name}</h3><p className={css.tagline}>{item.vendor.tagline}</p><p className={css.description}>{item.vendor.description}</p>
          <div className={css.menuTags}>{item.vendor.dietary_support.length ? item.vendor.dietary_support.map(diet => <span key={diet}>{diet} options</span>) : <span>Dietary adaptations not listed</span>}</div>
          <div className={css.price}><span>Sample package rate</span><strong>{sgd(item.vendor.per_guest)}<small> / guest</small></strong><span>Minimum {item.vendor.min_billable_guests} billed · capacity {item.vendor.max_guests}</span></div>
          <div className={css.total}><span>{item.estimate ? `Sample total for ${item.estimate.billable_guests} billed guests` : 'Add guests to calculate the total'}</span><strong>{sgd(item.estimate?.total)}</strong><small>{item.estimate ? 'Includes the sample setup, service charge and tax below.' : 'No guest count has been assumed.'}</small></div>
          <details className={css.breakdown}><summary>See the estimate & inclusions</summary>{item.estimate && <dl><div><dt>Food</dt><dd>{sgd(item.estimate.food_subtotal)}</dd></div><div><dt>Delivery & setup</dt><dd>{sgd(item.estimate.delivery_setup)}</dd></div><div><dt>Service ({item.vendor.service_percent}% of food)</dt><dd>{sgd(item.estimate.service_charge)}</dd></div><div><dt>Sample tax ({item.vendor.tax_percent}%)</dt><dd>{sgd(item.estimate.tax)}</dd></div></dl>}<h4>Included in the sample</h4><ul>{item.vendor.inclusions.map(text => <li key={text}>{text}</li>)}</ul><h4>Not included</h4><ul>{item.vendor.exclusions.map(text => <li key={text}>{text}</li>)}</ul></details>
          <div className={css.fit}><span className={state.needs_review ? css.unreviewed : item.matches ? css.fits : css.flag}>{state.needs_review ? 'Requirements to review' : item.matches ? 'Fits selected sample filters' : 'Needs changes or clarification'}</span><ul>{item.reasons.map(text => <li key={text}><Check size={13} />{text}</li>)}{item.concerns.map(text => <li className={css.concern} key={text}><span>!</span>{text}</li>)}</ul></div>
          <div className={css.availability}>Date availability: <strong>unconfirmed</strong></div><button className={state.shortlisted_ids.includes(item.vendor.id) ? css.selectedButton : css.shortlistButton} disabled={locked || (!state.shortlisted_ids.includes(item.vendor.id) && selected.length >= 3)} onClick={() => toggleVendor(item.vendor.id)}>{state.shortlisted_ids.includes(item.vendor.id) ? <><CheckCheck size={15} />Remove from comparison</> : <><Plus size={15} />Add to comparison</>}</button>
        </article>)}</div>
        {!results.length && (state.matched_count > 0 || search) && <p className={css.emptySearch}>No packages in this view. Try another search or show packages needing changes.</p>}
        <section className={css.comparison} ref={comparison} aria-label="Catering package comparison"><div className={css.resultsHeading}><div><span className={css.eyebrow}>SEE WHAT CHANGES THE TOTAL</span><h2>Your possibilities, side by side.</h2><p>{state.needs_review ? 'Your brief changed. Review the filters above; these saved packages may need to change too.' : 'Your shortlist is saved with this wedding. Nothing here is a booking or a supplier quote.'}</p></div></div>{selected.length ? <div className={css.tableWrap}><table><caption className="sr-only">Fictional catering package comparison in Singapore dollars</caption><thead><tr><th scope="col">Compare the details</th>{selected.map(item => <th scope="col" key={item.vendor.id}>{item.vendor.name}<button aria-label={`Remove ${item.vendor.name} from comparison`} disabled={locked} onClick={() => toggleVendor(item.vendor.id)}><X size={13} /></button></th>)}</tr></thead><tbody>{[
          ['Sample rate / guest', (item: VendorResult) => sgd(item.vendor.per_guest)],
          ['Billed portions', (item: VendorResult) => item.estimate?.billable_guests ?? 'Add guest count'],
          ['Food subtotal', (item: VendorResult) => sgd(item.estimate?.food_subtotal)],
          ['Delivery & setup', (item: VendorResult) => sgd(item.vendor.delivery_setup)],
          ['Service charge', (item: VendorResult) => sgd(item.estimate?.service_charge)],
          ['Sample tax', (item: VendorResult) => sgd(item.estimate?.tax)],
          ['Estimated package total', (item: VendorResult) => sgd(item.estimate?.total)],
          ['Against catering budget', gap],
          ['Sample filters', (item: VendorResult) => state.needs_review ? 'Review required' : item.matches ? 'Fits selected filters' : item.concerns.join(' ')],
          ['Included', (item: VendorResult) => item.vendor.inclusions.join(' · ')],
          ['Not included', (item: VendorResult) => item.vendor.exclusions.join(' · ')],
          ['Date availability', () => 'Unconfirmed'],
          ['Price status', () => 'Fictional estimate — not a quotation'],
        ].map(([label, render]) => <tr key={String(label)}><th scope="row">{String(label)}</th>{selected.map(item => <td key={item.vendor.id}>{(render as (item: VendorResult) => string | number)(item)}</td>)}</tr>)}</tbody></table></div> : <div className={css.comparisonEmpty}><Plus size={22} /><p>Review your filters, then add up to three packages to compare.</p></div>}<p className={css.finePrint}>Calculation: package rate × the larger of your guest count or the minimum order; add delivery/setup, service charge on food, then the sample tax on the subtotal. Unpriced extras, venue charges and future supplier changes are excluded.</p></section>
      </>}
    </main>
  </div>;
}
