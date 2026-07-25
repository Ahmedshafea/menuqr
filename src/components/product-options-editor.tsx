"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ProductOptionsInput } from "@/lib/product-options";

type ExistingOption = { id: string; name: string; nameAr: string | null; price: number };
type Labels = {
  title: string; help: string; addGroup: string; groupName: string; groupNameAr: string;
  required: string; optional: string; min: string; max: string; addOption: string;
  createNew: string; selectExisting: string; optionName: string; optionNameAr: string;
  price: string; free: string; remove: string;
};
type OptionRow = { key: string; id?: string; name: string; nameAr: string; price: number; mode: "new" | "existing" };
type GroupRow = { key: string; id?: string; name: string; nameAr: string; required: boolean; min: number; max: number; options: OptionRow[] };
const key = () => crypto.randomUUID();

export function ProductOptionsEditor({ existingOptions, initialGroups = [], labels }: {
  existingOptions: ExistingOption[];
  initialGroups?: ProductOptionsInput;
  labels: Labels;
}) {
  const [groups, setGroups] = useState<GroupRow[]>(() => initialGroups.map(group => ({
    key:key(),id:group.id,name:group.name,nameAr:group.nameAr??"",required:group.required,min:group.min,max:group.max,
    options:group.options.map(option=>({key:key(),id:option.id,name:option.name??"",nameAr:option.nameAr??"",price:Number(option.price)||0,mode:option.id?"existing":"new"})),
  })));
  const serialized=useMemo(()=>JSON.stringify(groups.map(group=>({id:group.id,name:group.name,nameAr:group.nameAr,required:group.required,min:group.required?group.min:0,max:group.required?group.max:Math.max(1,group.options.length),options:group.options.map(option=>({id:option.id,name:option.name,nameAr:option.nameAr,price:option.price}))}))),[groups]);
  const patchGroup=(groupKey:string,patch:Partial<GroupRow>)=>setGroups(current=>current.map(group=>group.key===groupKey?{...group,...patch}:group));
  const patchOption=(groupKey:string,optionKey:string,patch:Partial<OptionRow>)=>setGroups(current=>current.map(group=>group.key===groupKey?{...group,options:group.options.map(option=>option.key===optionKey?{...option,...patch}:option)}:group));
  return <section className="product-options-editor full"><input type="hidden" name="productOptions" value={serialized}/><header><div><h3>{labels.title}</h3><p>{labels.help}</p></div><button type="button" className="button ghost" onClick={()=>setGroups(current=>[...current,{key:key(),name:"",nameAr:"",required:false,min:0,max:1,options:[]}])}><Plus/>{labels.addGroup}</button></header>{groups.map(group=><article key={group.key} className="option-group-editor"><div className="option-group-head"><input value={group.name} onChange={event=>patchGroup(group.key,{name:event.target.value})} placeholder={labels.groupName}/><input value={group.nameAr} dir="rtl" onChange={event=>patchGroup(group.key,{nameAr:event.target.value})} placeholder={labels.groupNameAr}/><button type="button" aria-label={labels.remove} onClick={()=>setGroups(current=>current.filter(item=>item.key!==group.key))}><Trash2/></button></div><div className="option-rules"><label><input type="checkbox" checked={group.required} onChange={event=>patchGroup(group.key,{required:event.target.checked,min:event.target.checked?Math.max(1,group.min):0})}/>{group.required?labels.required:labels.optional}</label><label>{labels.min}<input type="number" min="0" max="20" value={group.required?group.min:0} disabled={!group.required} onChange={event=>patchGroup(group.key,{min:Number(event.target.value)})}/></label><label>{labels.max}<input type="number" min={Math.max(1,group.min)} max="20" value={group.required?group.max:Math.max(1,group.options.length)} disabled={!group.required} onChange={event=>patchGroup(group.key,{max:Number(event.target.value)})}/></label></div><div className="option-editor-list">{group.options.map(option=><div className="option-editor-row" key={option.key}><select value={option.mode} onChange={event=>patchOption(group.key,option.key,{mode:event.target.value as "new"|"existing",id:undefined,name:"",nameAr:"",price:0})}><option value="new">{labels.createNew}</option><option value="existing">{labels.selectExisting}</option></select>{option.mode==="existing"?<select value={option.id??""} onChange={event=>{const found=existingOptions.find(item=>item.id===event.target.value);if(found)patchOption(group.key,option.key,{id:found.id,name:found.name,nameAr:found.nameAr??"",price:found.price})}}><option value="">—</option>{existingOptions.map(item=><option value={item.id} key={item.id}>{item.name}{item.nameAr?` / ${item.nameAr}`:""}</option>)}</select>:<><input value={option.name} onChange={event=>patchOption(group.key,option.key,{name:event.target.value})} placeholder={labels.optionName}/><input value={option.nameAr} dir="rtl" onChange={event=>patchOption(group.key,option.key,{nameAr:event.target.value})} placeholder={labels.optionNameAr}/><label>{labels.price}<input type="number" step=".01" value={option.price} onChange={event=>patchOption(group.key,option.key,{price:Number(event.target.value)})}/></label></>}<button type="button" aria-label={labels.remove} onClick={()=>patchGroup(group.key,{options:group.options.filter(item=>item.key!==option.key)})}><Trash2/></button></div>)}</div><button type="button" className="add-option-row" onClick={()=>patchGroup(group.key,{options:[...group.options,{key:key(),name:"",nameAr:"",price:0,mode:"new"}]})}><Plus/>{labels.addOption}</button></article>)}</section>;
}
