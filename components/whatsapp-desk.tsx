import Link from 'next/link';
import { ArrowRight, ClipboardCheck, MessageCircle, Search, Sparkles } from 'lucide-react';
import type { Wedding } from '@/lib/planning-api';
import css from '@/app/controller/controller.module.css';

const steps = [
  {icon:Search,title:'Find matching vendors',detail:'Agents would search for vendors that fit your style, location, guest count and budget.'},
  {icon:MessageCircle,title:'Start the conversation',detail:'Request availability and itemised quotes through WhatsApp from vendors who agree to be contacted.'},
  {icon:Sparkles,title:'Follow up on the details',detail:'Ask about missing prices, menus and setup requirements, then bring the replies into your plan.'},
  {icon:ClipboardCheck,title:'Keep you in control',detail:'Bring bookings, payments, cancellations, schedule changes and changed terms back to you for approval.'},
];

export function WhatsAppDesk({wedding}:{wedding?:Wedding}) {
  const brief=wedding?.brief;
  const message=`Hello, we’re planning a wedding on ${brief?.date||'our chosen date'} in ${brief?.location||'our chosen location'}${brief?.guests?` for ${brief.guests} guests`:''}. Are you available? Could you share an itemised quote, including inclusions, exclusions and setup requirements? This is an enquiry, not a booking.`;
  return <section id="whatsapp" aria-label="Vendor outreach pilot" className={css.pilot}>
    <div className={css.sectionHeading}><div className={css.pilotTop}><span className={css.eyebrow}>LESS CHASING, MORE PLANNING</span><span className={css.pilotBadge}>PILOTING · PREVIEW ONLY</span></div>
      <h2>AI vendor search & WhatsApp outreach.</h2>
      <p>We’re piloting a workflow where agents find suitable vendors, contact them and organise their replies around your wedding brief.</p>
    </div>
    <div className={css.pilotSteps}>{steps.map(({icon:Icon,title,detail},index)=><article key={title}><span className={css.pilotStep}><Icon size={17}/><small>0{index+1}</small></span><h3>{title}</h3><p>{detail}</p></article>)}</div>
    <div className={css.pilotPreview}><div><span className={css.eyebrow}>ILLUSTRATIVE ENQUIRY · NOT SENT</span><h3>A conversation, ready to begin.</h3><p>{message}</p></div><aside><strong>Live outreach paused</strong><p>Automated vendor search is planned. The WhatsApp integration code is included, but live vendor conversations have not been tested.</p><p>This preview searches no external directories and sends no messages. Live activation is deferred until after the hackathon demo.</p><button type="button" className={css.secondary} disabled>Outreach pilot — not active</button><Link href="/vendors">Explore sample vendor comparisons<ArrowRight size={13}/></Link></aside></div>
  </section>;
}
