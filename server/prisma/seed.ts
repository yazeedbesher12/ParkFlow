import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import catalog from './data/catalog.json';
const db=new PrismaClient();
export async function seed(){
 for(const f of catalog.facilities){const {location,availability,...data}=f;await db.parkingFacility.upsert({where:{id:f.id},create:{...data,...location},update:{}});}
 for(const z of catalog.zones){const operatorId='operator-'+z.operatorName.toLowerCase().replace(/[^a-z0-9]+/g,'-');await db.parkingOperator.upsert({where:{id:operatorId},create:{id:operatorId,name:z.operatorName,type:z.kind==='street'?'municipality':'garage'},update:{name:z.operatorName,type:z.kind==='street'?'municipality':'garage'}});
 const raw=z as typeof z & {facilityId?:string;capacity?:number;ownership?:string;accessRestriction?:string;accessRestrictionAr?:string;parkingAllowed?:boolean;prototypeData?:boolean};
 const zoneData={operatorId,facilityId:raw.facilityId,code:z.code,name:z.name,nameAr:z.nameAr,city:z.city,cityAr:z.cityAr,kind:z.kind,...z.location,capacity:raw.capacity,ownership:raw.ownership,accessRestriction:raw.accessRestriction,accessRestrictionAr:raw.accessRestrictionAr,parkingAllowed:raw.parkingAllowed??true,prototypeData:raw.prototypeData??false,supportedModes:z.supportedModes as ('start_stop'|'prepaid')[],defaultMode:z.defaultMode as 'start_stop'|'prepaid',supportedEntryMethods:z.supportedEntryMethods};
 await db.parkingZone.upsert({where:{id:z.id},create:{id:z.id,...zoneData},update:zoneData});
 await db.parkingTariff.upsert({where:{id:z.tariff.id},create:{...z.tariff,zoneId:z.id},update:z.tariff});
 for(const h of z.operatingHours){const closed='closed' in h?(h.closed??false):false;await db.operatingHour.upsert({where:{zoneId_weekday:{zoneId:z.id,weekday:h.weekday}},create:{...h,closed,zoneId:z.id},update:{opensAt:h.opensAt,closesAt:h.closesAt,closed}});}
 // No fabricated occupancy reports, balances, users, or violations are seeded.
 }
 for(const c of catalog.checkpoints){const {location,...rest}=c;await db.roadCheckpoint.upsert({where:{id:c.id},create:{...rest,...location},update:{}});}
 if(process.env.NODE_ENV!=='production'){
  const demoUser=await db.user.upsert({where:{email:'road-reports-demo@parkflow.local'},create:{id:'road-reports-demo-user',email:'road-reports-demo@parkflow.local',emailVerifiedAt:new Date(),fullName:'Demo data (not a real reporter)',wallet:{create:{}}},update:{fullName:'Demo data (not a real reporter)'}});
  const now=Date.now();
  const demos=[
   {id:'demo-road-report-accident',type:'accident' as const,latitude:31.9051,longitude:35.2038,severity:'high' as const,description:'Demo only — sample accident report',minutes:74},
   {id:'demo-road-report-congestion',type:'traffic_congestion' as const,latitude:31.8992,longitude:35.2096,severity:'moderate' as const,direction:'northbound' as const,description:'Demo only — sample congestion report',minutes:24},
   {id:'demo-road-report-construction',type:'construction' as const,latitude:31.9122,longitude:35.1994,severity:'low' as const,direction:'both' as const,description:'Demo only — sample construction report',minutes:720},
   {id:'demo-road-report-hazard',type:'road_hazard' as const,latitude:31.8971,longitude:35.2012,severity:'moderate' as const,description:'Demo only — sample road hazard report',minutes:180},
  ];
  for(const item of demos){const {id,minutes,...data}=item;await db.roadReport.upsert({where:{id},create:{id,reporterUserId:demoUser.id,...data,isDemo:true,expiresAt:new Date(now+minutes*60000)},update:{reporterUserId:demoUser.id,...data,isDemo:true,status:'unverified',confidenceScore:0.35,confirmationCount:0,rejectionCount:0,expiresAt:new Date(now+minutes*60000)}});}
 }
 if(process.env.SEED_ADMIN_EMAIL&&process.env.NODE_ENV!=='production'){const email=process.env.SEED_ADMIN_EMAIL.trim().toLowerCase();await db.user.upsert({where:{email},create:{email,emailVerifiedAt:new Date(),fullName:'Development Admin',role:'ADMIN',wallet:{create:{}}},update:{}});}
}
if(require.main===module)seed().then(()=>console.log('Seeded parking catalog, checkpoints, and local demo road reports')).finally(()=>db.$disconnect());
