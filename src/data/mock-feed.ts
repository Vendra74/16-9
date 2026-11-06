/**
 * Feed de demonstração, só para ter uma ideia de como o app fica com
 * conteúdo. Perfis fictícios; fotos do Lorem Picsum (picsum.photos),
 * sempre pedidas em 16:9. Será substituído pelo backend (Supabase).
 */
export type Post = {
  id: string;
  imageUrl: string;
  author: {
    name: string;
    handle: string;
    specialty: string;
  };
  title: string;
  category: string;
  location: string;
  /** Ficha técnica opcional, como no formulário de publicação. */
  gear?: {
    camera: string;
    lens: string;
    settings: string;
  };
  likes: number;
  comments: number;
};

const photo = (id: number) => `https://picsum.photos/id/${id}/1920/1080`;

export const MOCK_FEED: Post[] = [
  {
    id: '1',
    imageUrl: photo(1015),
    author: { name: 'Marina Duarte', handle: 'marina.frames', specialty: 'Fotógrafa de natureza' },
    title: 'Vale ao amanhecer',
    category: 'Natureza',
    location: 'Serra da Mantiqueira, MG',
    gear: { camera: 'Sony A7 IV', lens: '24-70mm f/2.8', settings: '35mm · f/8 · 1/250s · ISO 100' },
    likes: 1248,
    comments: 87,
  },
  {
    id: '2',
    imageUrl: photo(1036),
    author: { name: 'Rafael Okada', handle: 'okada.cine', specialty: 'Diretor de fotografia' },
    title: 'Still do curta "Inverno"',
    category: 'Cinema',
    location: 'Urubici, SC',
    gear: { camera: 'Blackmagic Pocket 6K', lens: 'Sigma 18-35mm f/1.8', settings: '24mm · f/2.8 · 180° · ISO 400' },
    likes: 932,
    comments: 41,
  },
  {
    id: '3',
    imageUrl: photo(1043),
    author: { name: 'Bia Nogueira', handle: 'bianogueira', specialty: 'Fotógrafa de rua' },
    title: 'Fim de tarde',
    category: 'Rua',
    location: 'São Paulo, SP',
    gear: { camera: 'Fujifilm X100V', lens: '23mm f/2', settings: 'f/5.6 · 1/500s · ISO 200' },
    likes: 2310,
    comments: 156,
  },
  {
    id: '4',
    imageUrl: photo(1039),
    author: { name: 'Thiago Lemos', handle: 'thiagolemos.doc', specialty: 'Documentarista' },
    title: 'Água que corre',
    category: 'Documentário',
    location: 'Chapada Diamantina, BA',
    gear: { camera: 'Canon R5', lens: 'RF 15-35mm f/2.8', settings: '15mm · f/11 · 1/2s · ISO 50' },
    likes: 1784,
    comments: 92,
  },
  {
    id: '5',
    imageUrl: photo(1067),
    author: { name: 'Ana Clara Reis', handle: 'anaclara.arq', specialty: 'Fotógrafa de arquitetura' },
    title: 'Linhas da cidade',
    category: 'Arquitetura',
    location: 'Brasília, DF',
    likes: 645,
    comments: 23,
  },
  {
    id: '6',
    imageUrl: photo(1018),
    author: { name: 'Lucas Ferraz', handle: 'ferraz.drone', specialty: 'Videomaker e piloto de drone' },
    title: 'Cordilheira',
    category: 'Natureza',
    location: 'Torres del Paine, Chile',
    gear: { camera: 'DJI Mavic 3 Pro', lens: 'Hasselblad 24mm', settings: 'f/4 · 1/320s · ISO 100' },
    likes: 3102,
    comments: 210,
  },
  {
    id: '7',
    imageUrl: photo(1050),
    author: { name: 'Júlia Campos', handle: 'juliacampos', specialty: 'Fotógrafa de viagem' },
    title: 'Mar aberto',
    category: 'Viagem',
    location: 'Fernando de Noronha, PE',
    gear: { camera: 'Nikon Z6 II', lens: 'Z 70-200mm f/2.8', settings: '120mm · f/5.6 · 1/1000s · ISO 100' },
    likes: 1520,
    comments: 64,
  },
  {
    id: '8',
    imageUrl: photo(1044),
    author: { name: 'Pedro Siqueira', handle: 'siqueira.films', specialty: 'Cineasta' },
    title: 'Frame do videoclipe "Travessia"',
    category: 'Cinema',
    location: 'Lençóis Maranhenses, MA',
    gear: { camera: 'RED Komodo 6K', lens: 'Cooke Panchro 32mm', settings: 'T2.8 · 180° · ISO 800' },
    likes: 2875,
    comments: 133,
  },
];
