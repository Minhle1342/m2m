import { defineStore } from 'pinia';
export const useAppStore=defineStore('app',{state:()=>({notice:'',error:'',sidebarOpen:true}),actions:{notify(message:string){this.notice=message;this.error='';setTimeout(()=>{if(this.notice===message)this.notice=''},2500)},fail(error:unknown){this.error=error instanceof Error?error.message:String(error);this.notice=''}}});
