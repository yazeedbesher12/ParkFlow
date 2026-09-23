import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import catalog from './data/catalog.json';
const db=new PrismaClient();
export async function seed(){
 for(const f of catalog.facilities){const {location,availability,...data}=f;await db.parkingFacility.upsert({where:{id:f.id},create:{...data,...location},update:{}});}
 for(const z of catalog.zones){const operatorId='operator-'+z.operatorName.toLowerCase().replace(/[^a-z0-9]+/g,'-');await db.parkingOperator.upsert({where:{id:operatorId},create:{id:operatorId,name:z.operatorName,type:z.kind==='street'?'municipality':'garage'},update:{}});
 const raw=z as typeof z & {facilityId?:string;capacity?:number};
 await db.parkingZone.upsert({where:{id:z.id},create:{id:z.id,operatorId,facilityId:raw.facilityId,code:z.code,name:z.name,nameAr:z.nameAr,city:z.city,cityAr:z.cityAr,kind:z.kind,...z.location,capacity:raw.capacity,supportedModes:z.supportedModes as ('start_stop'|'prepaid')[],defaultMode:z.defaultMode as 'start_stop'|'prepaid',supportedEntryMethods:z.supportedEntryMethods},update:{}});
 await db.parkingTariff.upsert({where:{id:z.tariff.id},create:{...z.tariff,zoneId:z.id},update:{}});
 for(const h of z.operatingHours)await db.operatingHour.upsert({where:{zoneId_weekday:{zoneId:z.id,weekday:h.weekday}},create:{...h,zoneId:z.id},update:{}});
 // No fabricated occupancy reports, balances, users, or violations are seeded.
 }
 for(const c of catalog.checkpoints){const {location,...rest}=c;await db.roadCheckpoint.upsert({where:{id:c.id},create:{...rest,...location},update:{}});}
 if(process.env.SEED_ADMIN_PHONE&&process.env.NODE_ENV!=='production')await db.user.upsert({where:{phone:process.env.SEED_ADMIN_PHONE},create:{phone:process.env.SEED_ADMIN_PHONE,countryCode:process.env.SEED_ADMIN_PHONE.slice(0,4),fullName:'Development Admin',role:'ADMIN',wallet:{create:{}}},update:{}});
}
if(require.main===module)seed().then(()=>console.log('Seeded parking catalog and checkpoints')).finally(()=>db.$disconnect());
