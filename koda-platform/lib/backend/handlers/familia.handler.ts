import { supabase } from '../services/supabase';

export async function getFamilyContext(userId: string, date?: string): Promise<string> {
  // Use today if no date provided
  const queryDate = date ? new Date(date) : new Date();
  const dayOfWeek = queryDate.getDay(); // 0 (Sun) - 6 (Sat)

  // 1. Get all family members for the user
  const { data: members, error: membersError } = await supabase
    .from('family_members')
    .select('*')
    .eq('user_id', userId);

  if (membersError) {
    console.error('Error fetching family members:', membersError);
    return 'Hubo un error al recuperar la información familiar.';
  }

  if (!members || members.length === 0) {
    return 'No tienes información de familiares registrada.';
  }

  // 2. Fetch all activities for all members in parallel
  const memberIds = members.map(m => m.id);
  
  const { data: allActivities, error: actError } = await supabase
      .from('family_activities')
      .select('*')
      .in('member_id', memberIds)
      .contains('day_of_week', [dayOfWeek]);

  if (actError) {
      console.error('Error fetching family activities:', actError);
      // Determine to continue without activities or fail. Continuing without is more robust.
  }

  // Group activities by member_id for fast lookup
  const activitiesByMemberId = (allActivities || []).reduce((acc: any, act: any) => {
      if (!acc[act.member_id]) acc[act.member_id] = [];
      acc[act.member_id].push(act);
      return acc;
  }, {});

  // 3. Format the output
  let contextParts: string[] = [];
  contextParts.push(`CONTEXTO FAMILIAR PARA ${queryDate.toLocaleDateString('es-ES')}:`);

  for (const member of members) {
    let memberInfo = `[${member.name}, ${member.relation}`;
    
    // Add age if birthdate exists
    if (member.birthdate) {
        const birthDate = new Date(member.birthdate);
        let age = queryDate.getFullYear() - birthDate.getFullYear();
        const m = queryDate.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && queryDate.getDate() < birthDate.getDate())) {
            age--;
        }
        memberInfo += `, ${age} años`;
    }

    if (member.school) {
        memberInfo += ` — ${member.school}`;
        if (member.school_start && member.school_end) {
             memberInfo += ` ${member.school_start.substring(0,5)}-${member.school_end.substring(0,5)}`;
        }
    }

    // Get activities for this member today from pre-fetched data
    const memberActivities = activitiesByMemberId[member.id] || [];

    if (memberActivities.length > 0) {
        const activitiesStr = memberActivities.map((act: any) => {
            let actStr = act.name;
            if (act.start_time) actStr += ` hoy ${act.start_time.substring(0, 5)}`;
            if (act.location) actStr += ` en ${act.location}`;
            return actStr;
        }).join(', ');
        memberInfo += `, ${activitiesStr}`;
    }

    if (member.notes) {
        memberInfo += ` (Notas: ${member.notes})`;
    }

    memberInfo += `]`;
    contextParts.push(memberInfo);
  }

  return contextParts.join('\n');
}
