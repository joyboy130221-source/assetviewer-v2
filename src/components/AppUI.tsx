import { createContext, useContext, useState, type ReactNode } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { Toaster, toast as sonnerToast } from 'sonner';
import { AlertTriangle, CheckCircle2, HelpCircle, LoaderCircle, X } from 'lucide-react';

type ConfirmOptions={title?:string;message?:string;confirmText?:string;cancelText?:string;danger?:boolean};
type UIContextType={confirm:(o:ConfirmOptions)=>Promise<boolean>;toast:(m:string,t?:'success'|'error')=>void};
const C=createContext<UIContextType|null>(null);

export function AppUIProvider({children}:{children:ReactNode}){
  const [dialog,setDialog]=useState<(ConfirmOptions&{resolve:(v:boolean)=>void})|null>(null);
  const confirm=(o:ConfirmOptions)=>new Promise<boolean>(resolve=>setDialog({...o,resolve}));
  const toast=(m:string,t:'success'|'error'='success')=>t==='error'?sonnerToast.error(m):sonnerToast.success(m);
  const done=(v:boolean)=>{dialog?.resolve(v);setDialog(null)};
  return <C.Provider value={{confirm,toast}}>
    {children}
    <Toaster position="top-right" richColors closeButton duration={4500}/>
    <AlertDialog.Root open={!!dialog} onOpenChange={open=>{if(!open&&dialog)done(false)}}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay"/>
        <AlertDialog.Content className="dialog-content">
          <div className={`dialog-icon ${dialog?.danger?'danger':''}`}>{dialog?.danger?<AlertTriangle size={22}/>:<HelpCircle size={22}/>}</div>
          <div className="dialog-copy">
            <AlertDialog.Title className="dialog-title">{dialog?.title||'Confirm action'}</AlertDialog.Title>
            <AlertDialog.Description className="dialog-description">{dialog?.message||'Are you sure you want to continue?'}</AlertDialog.Description>
          </div>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild><button className="secondary-button"><X size={16}/>{dialog?.cancelText||'Cancel'}</button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><button className={dialog?.danger?'primary-button danger-button':'primary-button'} onClick={()=>done(true)}>{dialog?.danger?<AlertTriangle size={16}/>:<CheckCircle2 size={16}/>} {dialog?.confirmText||'Confirm'}</button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </C.Provider>
}
export function useAppUI(){const v=useContext(C);if(!v)throw new Error('useAppUI must be inside AppUIProvider');return v}
export function LoadingOverlay({show,text='Processing…'}:{show:boolean;text?:string}){return show?<div className="loading-overlay"><div className="loading-panel"><LoaderCircle className="spin-icon" size={21}/><span>{text}</span></div></div>:null}
