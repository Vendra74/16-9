# Biblioteca de músicas do 16:9

Faixas originais do projeto, compostas por código em `scripts/music/compose.py`
(sintetizadores, bateria e reverb gerados ali, sem amostras de terceiros).
Podem ser usadas livremente nos posts do app.

Os arquivos são servidos pelo site: `https://sixteennine.com.br/musica/<faixa>.m4a`.
A lista que o app mostra fica na tabela `music_tracks` do Supabase
(migração `supabase/migrations/20261115120000_music.sql`).

Para incluir uma faixa nova (inclusive de outra fonte com licença que permita uso
comercial em apps, como domínio público/CC0): coloque o `.m4a` nesta pasta e
adicione uma linha em `music_tracks` com o endereço dele.
