import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export async function exportCompanyBackup(companyId: string) {
  const grab = async (name: string) => {
    const snap = await getDocs(query(collection(db, name), where('companyId', '==', companyId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  };

  const companySnap = await getDoc(doc(db, 'companies', companyId));
  const users = await grab('users');
  const tasks = await grab('tasks');

  const backup = {
    exportedAt: new Date().toISOString(),
    companyId,
    company: companySnap.exists() ? { id: companySnap.id, ...companySnap.data() } : null,
    users,
    tasks,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `skdl-backup-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);

  return { users: users.length, tasks: tasks.length };
}