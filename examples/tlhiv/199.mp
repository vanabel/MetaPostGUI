vardef maxf(suffix f)(expr a,b) =
save m,i; numeric m,i;
m:=f(a);
for i=a step (b-a)/100 until b:
if m<f(i): m:="f(i);" fi;="" endfor;="" m="" enddef;="" vardef="" trace_rectangles_max="" (suffix="" f)(expr="" a,b,inc)="save" i;="" numeric="" for="" i="a" step="" inc="" until="" b-inc:="" path="" p;="" m;="" p="(i,0)--(i+inc,0)--(i+inc,m)--(i,m)--cycle;" :="p" scaled="" 1cm;="" fill="" withcolor="" .8*white;="" draw="" f(expr="" x)="4" -="" x**2="" trace_rectangles_max(f,-2,2,.5);="" trace(f,="" -2,2,.1);="" axes;="" ="" <="" pre="">
