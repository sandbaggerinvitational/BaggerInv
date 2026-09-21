import {notFound} from 'next/navigation';
import {applicationPageEnvironment} from '../../../lib/production-shadow-request-environment.js';
import {phoneEnrollmentEnabled} from '../../../lib/production-phone-enrollment-proof.js';
import {privatePageMetadata} from '../../../lib/seo.js';
import ApprovedMobileEnrollment from './ApprovedMobileEnrollment.js';
export const dynamic='force-dynamic';
export const metadata=privatePageMetadata('Verify approved mobile · The Bagger');
export default async function Page(){const env=await applicationPageEnvironment();if(!phoneEnrollmentEnabled(env))notFound();return <ApprovedMobileEnrollment/>;}
