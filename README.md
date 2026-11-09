# 16:9

**A frame for everyone.** Rede social de fotografia e vídeo onde todo conteúdo é horizontal em 16:9, feita para usar com o iPhone deitado.

O plano do produto (público, MVP, stack e roadmap) está no documento do projeto.

## Stack

- App: [Expo](https://expo.dev) (React Native + TypeScript) com Expo Router, travado em paisagem
- Backend (próximas etapas): Supabase (banco, login, fotos) e Mux (vídeo)

## Rodando

```bash
npm install
cp .env.example .env.local   # e preencha com os dados do Supabase
npx expo start
```

Abra o app **Expo Go** no iPhone e leia o QR code que aparece no terminal. Para builds de TestFlight, use o EAS (`npx eas-cli@latest build -p ios`), que compila na nuvem sem precisar de Mac.

## Login e backend (Supabase)

O app pede login antes de mostrar o feed. A conta é por e-mail e senha, e cada pessoa ganha um perfil (nome, @usuário, especialidade, cidade, bio). Os testers mandam feedback pela tela de Perfil.

Para ligar o backend:

1. Crie um projeto em [supabase.com](https://supabase.com) (região São Paulo).
2. No **SQL Editor**, rode `supabase/migrations/20261109000000_profiles_feedback.sql`. Ele cria as tabelas `profiles` e `feedback` com as regras de acesso.
3. Em **Authentication > Sign In / Providers > Email**, desligue **Confirm email** durante os testes. O e-mail embutido do Supabase só envia poucas mensagens por hora; para exigir confirmação, configure um SMTP próprio antes.
4. Em **Project Settings > API**, copie a URL e a chave *publishable* (ou *anon*) para `.env.local` e para as variáveis do EAS (abaixo).

O feedback dos testers aparece em **Table Editor > feedback**. Para trocar a senha de alguém, use **Authentication > Users**.

## Distribuindo para testers (TestFlight)

Precisa de uma conta Apple Developer (US$ 99/ano) e de uma conta Expo. Tudo compila na nuvem, sem Mac.

```bash
npx eas-cli@latest login
npx eas-cli@latest init                      # liga o app a um projeto Expo
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://SEU-PROJETO.supabase.co --visibility plaintext
npx eas-cli@latest env:create --environment production --name EXPO_PUBLIC_SUPABASE_KEY --value sb_publishable_... --visibility plaintext
npx eas-cli@latest build -p ios --profile production --auto-submit
```

O primeiro build pede o login da Apple e cria certificados e o app no App Store Connect. Depois que o build chega lá, adicione os testers em **App Store Connect > TestFlight**: até 100 pessoas do time sem revisão, ou até 10.000 por link público depois de uma revisão rápida da Apple.

O identificador do app é `br.com.vendra.sixteennine` (em `app.json`). Troque antes do primeiro build se preferir outro; depois não muda mais.

## Verificações

```bash
npm run typecheck
npm run lint
```

## Estrutura

- `src/app/`: telas (cada arquivo é uma rota). `sign-in.tsx` é a entrada; `(app)/` é a área logada com Feed, Explorar, Publicar e Perfil.
- `src/lib/`: cliente do Supabase, sessão de login e funções de perfil e feedback.
- `supabase/migrations/`: o banco (tabelas, regras de acesso e gatilhos).
- `src/components/aperture.tsx`: o diafragma animado (abertura do app e indicador de carregamento).
- `src/components/side-rail.tsx`: o trilho de navegação na lateral. A tela do iPhone deitado é mais larga que 16:9, então a sobra vira o menu e a imagem nunca é coberta.
- `src/components/post-card.tsx`: um trabalho no feed, na moldura 16:9, com autor, ficha técnica, curtidas e comentários.
- `src/data/mock-feed.ts`: feed de demonstração com perfis fictícios e fotos do Lorem Picsum, até o backend existir.
- `src/constants/theme.ts`: cores e medidas da identidade visual.
