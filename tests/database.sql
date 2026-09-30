-- Run in a disposable project or against the empty deployed project. All fixtures roll back.
begin;
select set_config('test.owner',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true),set_config('test.item',gen_random_uuid()::text,true),set_config('test.account',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.owner')::uuid,'fixture-owner@example.invalid'),(current_setting('test.other')::uuid,'fixture-other@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
select public.initialize_budget();
select public.initialize_budget();
do $$ begin
 if (select count(*) from public.categories)<>16 then raise exception 'Default category initialization is not idempotent'; end if;
 begin perform * from public.plaid_tokens;raise exception 'Token table exposed';exception when insufficient_privilege then null;end;
 begin perform public.claim_sync(gen_random_uuid(),gen_random_uuid());raise exception 'Sync function exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into public.categories(user_id,name,slug,icon) values(current_setting('test.other')::uuid,'Other owner private','private','dots');
insert into public.institutions(id,user_id,plaid_item_id,name) values(current_setting('test.item')::uuid,current_setting('test.owner')::uuid,'fixture-item-'||current_setting('test.item'),'Fixture bank');
insert into public.accounts(id,user_id,institution_id,plaid_account_id,name,type) values(current_setting('test.account')::uuid,current_setting('test.owner')::uuid,current_setting('test.item')::uuid,'fixture-account-'||current_setting('test.account'),'Fixture checking','depository');
insert into public.plaid_tokens(institution_id,user_id,encrypted_access_token) values(current_setting('test.item')::uuid,current_setting('test.owner')::uuid,'encrypted-test-fixture');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
do $$ begin
 if exists(select 1 from public.categories where name='Other owner private') then raise exception 'Cross-owner read allowed';end if;
 if exists(select 1 from public.categories where user_id<>auth.uid()) then raise exception 'RLS owner boundary failed';end if;
end $$;
reset role;
-- Claim and commit a pending transaction, then convert it to posted preserving edits.
select set_config('test.lease',gen_random_uuid()::text,true);
select public.claim_sync(current_setting('test.item')::uuid,current_setting('test.lease')::uuid);
select public.apply_sync_batch(current_setting('test.item')::uuid,current_setting('test.lease')::uuid,'cursor-1',jsonb_build_array(jsonb_build_object('plaid_transaction_id','fixture-pending-'||current_setting('test.item'),'account_id',current_setting('test.account'),'merchant_name','Coffee','original_name','COFFEE','amount',10.50,'currency','USD','transaction_date','2026-09-10','pending',true,'transaction_type','purchase')),array[]::text[]);
set local role authenticated;
update public.transactions set user_category_id=(select id from public.categories where default_key='dining-drinks'),notes='Keep this note',budget_override=false;
reset role;
update public.plaid_tokens set last_attempt_at=null;
select set_config('test.lease',gen_random_uuid()::text,true);
select public.claim_sync(current_setting('test.item')::uuid,current_setting('test.lease')::uuid);
select public.apply_sync_batch(current_setting('test.item')::uuid,current_setting('test.lease')::uuid,'cursor-2',jsonb_build_array(jsonb_build_object('plaid_transaction_id','fixture-posted-'||current_setting('test.item'),'pending_transaction_id','fixture-pending-'||current_setting('test.item'),'account_id',current_setting('test.account'),'merchant_name','Coffee','original_name','COFFEE','amount',11.50,'currency','USD','transaction_date','2026-09-11','pending',false,'transaction_type','purchase')),array['fixture-pending-'||current_setting('test.item')]);
-- Replay the same posted record; uniqueness must protect from duplicates.
update public.plaid_tokens set last_attempt_at=null;
select set_config('test.lease',gen_random_uuid()::text,true);
select public.claim_sync(current_setting('test.item')::uuid,current_setting('test.lease')::uuid);
select public.apply_sync_batch(current_setting('test.item')::uuid,current_setting('test.lease')::uuid,'cursor-3',jsonb_build_array(jsonb_build_object('plaid_transaction_id','fixture-posted-'||current_setting('test.item'),'account_id',current_setting('test.account'),'merchant_name','Coffee','original_name','COFFEE','amount',11.50,'currency','USD','transaction_date','2026-09-11','pending',false,'transaction_type','purchase')),array[]::text[]);
do $$ begin
 if (select count(*) from public.transactions where user_id=current_setting('test.owner')::uuid and not removed)<>1 then raise exception 'Duplicate or pending double count'; end if;
 if not exists(select 1 from public.transactions where plaid_transaction_id='fixture-posted-'||current_setting('test.item') and notes='Keep this note' and budget_override=false and user_category_id is not null) then raise exception 'Posted transaction lost manual edits'; end if;
 if (select cursor from public.plaid_tokens where institution_id=current_setting('test.item')::uuid)<>'cursor-3' then raise exception 'Cursor not committed';end if;
end $$;
-- Composite ownership foreign keys must reject another owner's category, even for server writes.
do $$ begin
 begin
 update public.transactions set user_category_id=(select id from public.categories where user_id=current_setting('test.other')::uuid) where user_id=current_setting('test.owner')::uuid;
 raise exception 'Cross-owner category allowed';
 exception when foreign_key_violation then null;end;
end $$;
-- Delete a used custom category through the authenticated RPC without destroying history.
set local role authenticated;
insert into public.categories(user_id,name,slug,icon) values(auth.uid(),'Fixture Coffee','fixture-coffee','coffee');
update public.transactions set user_category_id=(select id from public.categories where slug='fixture-coffee');
insert into public.transaction_category_rules(user_id,rule_type,match_value,category_id) select auth.uid(),'merchant_contains','COFFEE',id from public.categories where slug='fixture-coffee';
insert into public.budgets(user_id,category_id,month,limit_amount) select auth.uid(),id,'2026-09-01',100 from public.categories where slug='fixture-coffee';
select public.delete_custom_category((select id from public.categories where slug='fixture-coffee'),(select id from public.categories where default_key='other'));
do $$ begin
 if exists(select 1 from public.categories where slug='fixture-coffee') then raise exception 'Custom category not deleted';end if;
 if not exists(select 1 from public.transactions t join public.categories c on c.id=t.user_category_id where not t.removed and t.notes='Keep this note' and c.default_key='other') then raise exception 'Deletion lost transaction history';end if;
 if not exists(select 1 from public.transaction_category_rules r join public.categories c on c.id=r.category_id where c.default_key='other') then raise exception 'Deletion lost rule assignment';end if;
end $$;
reset role;
set local role anon;
do $$ begin begin perform * from public.transactions;raise exception 'Anonymous financial access allowed';exception when insufficient_privilege then null;end;end $$;
reset role;
select 'PASS: RLS, token isolation, idempotency, posted reconciliation, cursor atomicity, and category reassignment' as verification;
rollback;
