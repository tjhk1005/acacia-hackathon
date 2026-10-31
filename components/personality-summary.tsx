import Link from 'next/link';
import { signatureCategories, type PersonalityProfile } from '@/lib/personality';

export function PersonalitySummary({ profile }: { profile?: PersonalityProfile }) {
  if (!profile || (!profile.words && !profile.feelings.length && !profile.worlds.length && !profile.signatures.length)) return null;
  const groups = [
    { label: 'How it feels', ideas: profile.feelings },
    { label: 'The worlds you love', ideas: profile.worlds },
    ...signatureCategories.map(category => ({ label: category.label, ideas: profile.signatures.filter(idea => idea.kind === category.id) })),
  ];
  return <section className="shared-personality" aria-label="Your wedding personality">
    <div className="shared-personality-heading"><h2>Your wedding personality</h2><Link href="/">Refine in the quiz →</Link></div>
    {profile.words && <p className="shared-personality-words">“{profile.words}”</p>}
    <div className="shared-personality-groups">{groups.filter(group => group.ideas.length).map(group => <div key={group.label}><h3>{group.label}</h3><div>{group.ideas.map(idea => <span key={idea.id}>{idea.kind === 'palette' && <i className="shared-palette" aria-hidden="true">{idea.colors.map((color, index) => <i key={index} style={{ background: color }} />)}</i>}{idea.title}</span>)}</div></div>)}</div>
    <p className="shared-personality-note">Kept ideas are inspiration to explore together. Availability, prices and practical fit still need checking.</p>
  </section>;
}
