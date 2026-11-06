# 16:9

**A frame for everyone.** Rede social de fotografia e vídeo onde todo conteúdo é horizontal em 16:9, feita para usar com o iPhone deitado.

O plano do produto (público, MVP, stack e roadmap) está no documento do projeto.

## Stack

- App: [Expo](https://expo.dev) (React Native + TypeScript) com Expo Router, travado em paisagem
- Backend (próximas etapas): Supabase (banco, login, fotos) e Mux (vídeo)

## Rodando

```bash
npm install
npx expo start
```

Abra o app **Expo Go** no iPhone e leia o QR code que aparece no terminal. Para builds de TestFlight, use o EAS (`npx eas-cli@latest build -p ios`), que compila na nuvem sem precisar de Mac.

## Verificações

```bash
npm run typecheck
npm run lint
```

## Estrutura

- `src/app/`: telas (cada arquivo é uma rota). Feed, Explorar, Publicar e Perfil.
- `src/components/aperture.tsx`: o diafragma animado (abertura do app e indicador de carregamento).
- `src/components/side-rail.tsx`: o trilho de navegação na lateral. A tela do iPhone deitado é mais larga que 16:9, então a sobra vira o menu e a imagem nunca é coberta.
- `src/components/post-card.tsx`: um trabalho no feed, na moldura 16:9, com autor, ficha técnica, curtidas e comentários.
- `src/data/mock-feed.ts`: feed de demonstração com perfis fictícios e fotos do Lorem Picsum, até o backend existir.
- `src/constants/theme.ts`: cores e medidas da identidade visual.
