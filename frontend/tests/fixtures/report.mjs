export function sampleReport(){
  return {run_id:'12345678-1234-4234-8234-123456789abc',root_run_id:'12345678-1234-4234-8234-123456789abc',
    status:'completed',created_at:'2026-11-18T03:12:30Z',extracted_at:'2026-11-18T03:12:29Z',origin:'data_check',source_engine:'postgresql',
    dataset:{connection_id:'customer_source',connection_name:'Customer Database',schema:'public',table:'customers'},
    sample_count:8,population_count:8,column_count:3,sample_seed:42,
    profiles:{customer_id:{missing:0,distinct:8,types:['str'],pii:true},email:{missing:1,distinct:7,types:['str'],pii:true},
      age:{missing:0,distinct:8,types:['int'],pii:false,min:21,max:150,mean:42}},
    pii:{customer_id:{categories:['source_identifier'],nonempty_count:8,method:'configured_policy_and_patterns'},
      email:{categories:['email'],nonempty_count:7,method:'configured_policy_and_patterns'}},
    validation:{checks:40,issue_count:1,score:97.5,issues:[{column:'email',rule:'required',row_ref:'a'.repeat(24),recommendation:'Review email: enforce required rule at ingestion.'}]},
    after_validation:{checks:40,issue_count:1,score:97.5,issues:[]},anomalies:[],changes:[],
    agent:{ai_used:false,mode:'deterministic',trace:[{step:1,selected_tool:'validate',available_tools:['validate'],observation:{finding_count:1,checks:40}}]},
    limitations:['Sample results do not establish population quality.','Output corrections never modify source records.'],
    recommendations:['Review email: enforce required rule at ingestion.'],
    assessment:{hash:'a'.repeat(64),engine_version:'quality-rules-v2',sampling_version:'bounded-seeded-random-v1'},
  };
}
