create table public.user_preferences (
 user_id uuid primary key references auth.users on delete cascade,
 include_pending boolean not null default true, theme text not null default 'light' check(theme in ('light','dark','system')),
 default_month text not null default 'current' check(default_month in ('current','last')), timezone text not null default 'America/Chicago',
 onboarding_complete boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.categories (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 name text not null check(length(name) between 1 and 60), slug text not null, icon text not null default 'dots', parent_category_id uuid,
 is_default boolean not null default false, active boolean not null default true, sort_order integer not null default 0,
 monthly_budget numeric(14,2) not null default 0 check(monthly_budget>=0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,id), unique(user_id,slug), foreign key(user_id,parent_category_id) references public.categories(user_id,id), check(parent_category_id is distinct from id)
);
create table public.institutions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 plaid_item_id text not null unique, plaid_institution_id text, name text not null,
 last_synced_at timestamptz, status text not null default 'connected', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,id)
);
-- No client grants and no client RLS policies. Only the server's service role can access encrypted tokens.
create table public.plaid_tokens (
 institution_id uuid primary key references public.institutions on delete cascade, user_id uuid not null references auth.users on delete cascade,
 encrypted_access_token text not null, cursor text, lease_id uuid, lease_until timestamptz, last_attempt_at timestamptz,
 foreign key(user_id,institution_id) references public.institutions(user_id,id)
);
create table public.accounts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 institution_id uuid not null, plaid_account_id text not null unique, name text not null, mask text check(length(mask)<=4),
 type text not null, subtype text, current_balance numeric(16,2), available_balance numeric(16,2), currency text not null default 'USD',
 include_in_budget boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,id),
 unique(user_id,id,institution_id), foreign key(user_id,institution_id) references public.institutions(user_id,id)
);
create table public.transactions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 account_id uuid not null, institution_id uuid not null, plaid_transaction_id text not null unique, pending_transaction_id text,
 merchant_name text, original_name text not null, amount numeric(16,2) not null, currency text not null default 'USD',
 transaction_date date not null, authorized_date date, pending boolean not null default false,
 plaid_primary_category text, plaid_detailed_category text, category_id uuid, user_category_id uuid,
 transaction_type text not null check(transaction_type in ('purchase','refund','transfer','income')),
 excluded_from_budget boolean not null default false, budget_override boolean,
 notes text not null default '' check(length(notes)<=2000), removed boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(user_id,account_id,institution_id) references public.accounts(user_id,id,institution_id),
 foreign key(user_id,category_id) references public.categories(user_id,id),
 foreign key(user_id,user_category_id) references public.categories(user_id,id)
);
create table public.budgets (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 category_id uuid not null, month date not null check(extract(day from month)=1), limit_amount numeric(14,2) not null check(limit_amount>=0),
 rollover_enabled boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,category_id,month), foreign key(user_id,category_id) references public.categories(user_id,id)
);
create table public.transaction_category_rules (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 rule_type text not null check(rule_type in ('merchant_contains','merchant_equals','description_contains')),
 match_value text not null check(length(trim(match_value)) between 1 and 200), category_id uuid not null,
 priority integer not null default 100, active boolean not null default true, exclude_from_budget boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(user_id,category_id) references public.categories(user_id,id)
);
-- Future recurring detection stores provider stream ids, never inferred certainty.
create table public.recurring_expenses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 account_id uuid not null, plaid_stream_id text, merchant_name text, frequency text, average_amount numeric(14,2), next_expected_date date,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(user_id,account_id) references public.accounts(user_id,id), unique(user_id,plaid_stream_id)
);
create index transactions_user_date_idx on public.transactions(user_id,transaction_date desc);
create index transactions_account_idx on public.transactions(account_id);
create index transactions_category_idx on public.transactions(category_id);
create index transactions_user_category_idx on public.transactions(user_category_id);
create index transactions_pending_id_idx on public.transactions(pending_transaction_id);
create index transactions_institution_idx on public.transactions(institution_id);
create index accounts_institution_idx on public.accounts(institution_id);
create index categories_parent_idx on public.categories(parent_category_id);
create index rules_user_priority_idx on public.transaction_category_rules(user_id,priority);
create index rules_category_idx on public.transaction_category_rules(category_id);
create index budgets_category_idx on public.budgets(category_id);
create index recurring_account_idx on public.recurring_expenses(account_id);
create index plaid_tokens_user_idx on public.plaid_tokens(user_id);
create function public.touch_updated_at() returns trigger language plpgsql security invoker set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare t text; begin
 foreach t in array array['user_preferences','categories','institutions','accounts','transactions','budgets','transaction_category_rules','recurring_expenses'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
 execute format('create trigger touch_updated before update on public.%I for each row execute function public.touch_updated_at()',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
alter table public.plaid_tokens enable row level security;
revoke all on public.plaid_tokens from anon, authenticated;
grant all on public.plaid_tokens to service_role;
grant select,insert,update on public.user_preferences, public.categories, public.budgets, public.transaction_category_rules to authenticated;
grant delete on public.categories, public.budgets, public.transaction_category_rules to authenticated;
grant select on public.institutions,public.accounts,public.transactions,public.recurring_expenses to authenticated;
grant update(include_in_budget) on public.accounts to authenticated;
grant update(user_category_id,budget_override,notes) on public.transactions to authenticated;
create function public.initialize_budget() returns void language plpgsql security invoker set search_path='' as $$
 declare owner_id uuid := auth.uid();
 begin
 if owner_id is null then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtext(owner_id::text));
 insert into public.user_preferences(user_id) values(owner_id) on conflict do nothing;
 if exists(select 1 from public.categories where user_id=owner_id) then return; end if;
 insert into public.categories(user_id,name,slug,icon,monthly_budget,is_default,sort_order)
 select owner_id,x.name,x.slug,x.icon,0,true,x.ord from (values
 ('Housing','housing','home',0),('Groceries','groceries','basket',1),('Dining & Drinks','dining-drinks','coffee',2),
 ('Transportation','transportation','car',3),('Shopping','shopping','bag',4),('Entertainment','entertainment','play',5),
 ('Travel','travel','plane',6),('Health & Wellness','health-wellness','heart',7),('Bills & Utilities','bills-utilities','zap',8),
 ('Services','services','wrench',9),('Gifts & Donations','gifts-donations','gift',10),('Financial','financial','wallet',11),
 ('Education','education','book',12),('Family & Kids','family-kids','users',13),('Pets','pets','paw',14),('Other','other','dots',15)
 ) as x(name,slug,icon,ord) on conflict(user_id,slug) do nothing;
 end $$;
create function public.delete_custom_category(category uuid,replacement uuid) returns void language plpgsql security invoker set search_path='' as $$
 begin
 if category=replacement or not exists(select 1 from public.categories where id=replacement and user_id=auth.uid()) then raise exception 'Invalid replacement'; end if;
 if not exists(select 1 from public.categories where id=category and user_id=auth.uid() and not is_default) then raise exception 'Only custom categories can be deleted'; end if;
 update public.transactions set user_category_id=replacement where user_category_id=category or (category_id=category and user_category_id is null);
 -- category_id is provider-owned; manual override above preserves history. Clear provider category through a dedicated service cleanup only if one was assigned.
 if exists(select 1 from public.transactions where category_id=category) then raise exception 'Archive this category instead'; end if;
 update public.transaction_category_rules set category_id=replacement where category_id=category;
 update public.categories set parent_category_id=null where parent_category_id=category;
 delete from public.budgets where category_id=category;
 delete from public.categories where id=category;
 end $$;
create function public.reorder_categories(ordered_ids uuid[]) returns void language plpgsql security invoker set search_path='' as $$
 begin update public.categories c set sort_order=x.ordinality from unnest(ordered_ids) with ordinality as x(id,ordinality) where c.id=x.id and c.user_id=auth.uid(); end $$;
-- Lease guards concurrent webhook/manual syncs across Vercel instances.
create function public.claim_sync(item uuid,lease uuid) returns boolean language plpgsql security invoker set search_path='' as $$
 declare affected integer;
 begin update public.plaid_tokens set lease_id=lease,lease_until=now()+interval '4 minutes',last_attempt_at=now()
 where institution_id=item and (lease_until is null or lease_until<now()) and (last_attempt_at is null or last_attempt_at<now()-interval '10 seconds');
 get diagnostics affected=row_count; return affected=1; end $$;
-- All changes and cursor checkpoint commit together. Replays update the same unique Plaid id.
create function public.apply_sync_batch(item uuid,lease uuid,next_cursor text,changed jsonb,removed_ids text[]) returns void language plpgsql security invoker set search_path='' as $$
 declare owner_id uuid; row jsonb; old public.transactions%rowtype; new_id uuid;
 begin
 select user_id into owner_id from public.plaid_tokens where institution_id=item and lease_id=lease and lease_until>now() for update;
 if owner_id is null then raise exception 'Invalid sync lease'; end if;
 for row in select * from jsonb_array_elements(changed) loop
 old:=null;
 if row->>'pending_transaction_id' is not null then select * into old from public.transactions where user_id=owner_id and institution_id=item and plaid_transaction_id=row->>'pending_transaction_id'; end if;
 insert into public.transactions(user_id,account_id,institution_id,plaid_transaction_id,pending_transaction_id,merchant_name,original_name,amount,currency,transaction_date,authorized_date,pending,plaid_primary_category,plaid_detailed_category,transaction_type,user_category_id,budget_override,notes)
 values(owner_id,(row->>'account_id')::uuid,item,row->>'plaid_transaction_id',row->>'pending_transaction_id',row->>'merchant_name',row->>'original_name',(row->>'amount')::numeric,row->>'currency',(row->>'transaction_date')::date,(row->>'authorized_date')::date,(row->>'pending')::boolean,row->>'plaid_primary_category',row->>'plaid_detailed_category',row->>'transaction_type',old.user_category_id,old.budget_override,coalesce(old.notes,''))
 on conflict(plaid_transaction_id) do update set merchant_name=excluded.merchant_name,original_name=excluded.original_name,amount=excluded.amount,currency=excluded.currency,transaction_date=excluded.transaction_date,authorized_date=excluded.authorized_date,pending=excluded.pending,plaid_primary_category=excluded.plaid_primary_category,plaid_detailed_category=excluded.plaid_detailed_category,transaction_type=excluded.transaction_type,removed=false,
 user_category_id=coalesce(public.transactions.user_category_id,excluded.user_category_id),budget_override=coalesce(public.transactions.budget_override,excluded.budget_override),notes=case when public.transactions.notes='' then excluded.notes else public.transactions.notes end
 where public.transactions.user_id=owner_id and public.transactions.institution_id=item returning id into new_id;
 if new_id is null then raise exception 'Transaction owner mismatch'; end if;
 if old.id is not null then update public.transactions set removed=true where id=old.id and id<>new_id; end if;
 end loop;
 update public.transactions set removed=true where user_id=owner_id and institution_id=item and plaid_transaction_id=any(removed_ids);
 update public.plaid_tokens set cursor=next_cursor,lease_id=null,lease_until=null where institution_id=item;
 update public.institutions set last_synced_at=now(),status='connected' where id=item;
 end $$;
revoke execute on function public.touch_updated_at(),public.initialize_budget(),public.delete_custom_category(uuid,uuid),public.reorder_categories(uuid[]),public.claim_sync(uuid,uuid),public.apply_sync_batch(uuid,uuid,text,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.initialize_budget(),public.delete_custom_category(uuid,uuid),public.reorder_categories(uuid[]) to authenticated;
grant execute on function public.claim_sync(uuid,uuid),public.apply_sync_batch(uuid,uuid,text,jsonb,text[]) to service_role;
