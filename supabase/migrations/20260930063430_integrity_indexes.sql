create index accounts_owner_institution_idx on public.accounts(user_id,institution_id);
create index categories_owner_parent_idx on public.categories(user_id,parent_category_id);
create index plaid_tokens_owner_institution_idx on public.plaid_tokens(user_id,institution_id);
create index recurring_owner_account_idx on public.recurring_expenses(user_id,account_id);
create index rules_owner_category_idx on public.transaction_category_rules(user_id,category_id);
create index transactions_owner_account_institution_idx on public.transactions(user_id,account_id,institution_id);
create index transactions_owner_category_idx on public.transactions(user_id,category_id);
create index transactions_owner_override_idx on public.transactions(user_id,user_category_id);
-- Stable default classification survives user renames and archival.
alter table public.categories add column default_key text;
update public.categories set default_key=slug where is_default;
create or replace function public.initialize_budget() returns void language plpgsql security invoker set search_path='' as $$
 declare owner_id uuid := auth.uid();
 begin
 if owner_id is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtext(owner_id::text));
 insert into public.user_preferences(user_id) values(owner_id) on conflict do nothing;
 if exists(select 1 from public.categories where user_id=owner_id) then return; end if;
 insert into public.categories(user_id,name,slug,default_key,icon,monthly_budget,is_default,sort_order)
 select owner_id,x.name,x.slug,x.slug,x.icon,0,true,x.ord from (values
 ('Housing','housing','home',0),('Groceries','groceries','basket',1),('Dining & Drinks','dining-drinks','coffee',2),
 ('Transportation','transportation','car',3),('Shopping','shopping','bag',4),('Entertainment','entertainment','play',5),
 ('Travel','travel','plane',6),('Health & Wellness','health-wellness','heart',7),('Bills & Utilities','bills-utilities','zap',8),
 ('Services','services','wrench',9),('Gifts & Donations','gifts-donations','gift',10),('Financial','financial','wallet',11),
 ('Education','education','book',12),('Family & Kids','family-kids','users',13),('Pets','pets','paw',14),('Other','other','dots',15)
 ) as x(name,slug,icon,ord) on conflict(user_id,slug) do nothing;
 end $$;
