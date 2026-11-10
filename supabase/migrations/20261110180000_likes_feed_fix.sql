-- 16:9: conserto do feed depois das curtidas. Rode uma vez no SQL Editor.
--
-- A tabela likes tinha (post_id, user_id) como chave primária, e a API do Supabase
-- passou a enxergar um segundo caminho entre posts e profiles ("quem curtiu").
-- Com dois caminhos, o pedido "autor do post" ficava ambíguo e o feed inteiro falhava.
-- A chave vira um id próprio; a regra de uma curtida por pessoa por post continua.

alter table public.likes drop constraint likes_pkey;
alter table public.likes add column id bigint generated always as identity primary key;
alter table public.likes add constraint likes_post_user_key unique (post_id, user_id);

notify pgrst, 'reload schema';
