import { Check, ExternalLink } from 'lucide-react';
import { photoPath, pinterestSearch, type Photo } from '@/lib/inspiration';

type Props = {
  id: string; title: string; description: string; photo: Photo; colors: string[];
  selected: boolean; onSelect: () => void; feeling?: string;
};
export function InspirationCard({ title, description, photo, colors, selected, onSelect, feeling }: Props) {
  return <article className={`inspiration-option ${selected ? 'selected' : ''}`}>
    <button type="button" className="inspiration-select" aria-label={`Choose ${title}`} aria-pressed={selected} onClick={onSelect}>
      <div className="reference-photo">
        {/* Local, licensed reference photos need no external image service or API. */}
        <img src={photoPath(photo)} alt={photo.alt} width={1000} height={700} loading="lazy"/>
        <span className="selection-indicator">{selected && <Check size={16}/>}</span>
        {selected && <span className="chosen-label">Feels like us</span>}
      </div>
      <div className="reference-copy">
        {feeling && <span className="reference-feeling">{feeling}</span>}
        <h3>{title}</h3><p>{description}</p>
        <div className="swatches" aria-label="Suggested colour palette">{colors.map(color => <span key={color} style={{background: color}}/>)}</div>
      </div>
    </button>
    <div className="reference-links"><a href={photo.source} target="_blank" rel="noreferrer" aria-label={`Photo by ${photo.photographer} on Pexels`}>Photo: {photo.photographer}</a><a href={pinterestSearch(title)} target="_blank" rel="noreferrer">Pinterest <ExternalLink size={10}/></a></div>
  </article>;
}
